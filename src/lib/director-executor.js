import prisma from "@/lib/prisma";
import { generateImage, generateI2I, generateVideo, generateI2V, generateAudio } from "@/lib/generation";
import { resolveProvider, resolveProviderWithFallback, brandError, logProviderError } from "@/lib/providers";
import { estimateCredits } from "@/lib/pricing-engine";
import { storeMedia } from "@/lib/media-storage";
import { assembleVideos } from "@/lib/video-assembly";
import { validatePrompt } from "@/lib/director-planner";
import { getWallet, debitWallet, refundCredits } from "@/lib/wallet";

// ──────────────────────────────────────────────
// Pipeline State Machine
// ──────────────────────────────────────────────
const PIPELINE_STATES = {
  DRAFT: "draft",
  PLANNING: "planning",
  AWAITING_APPROVAL: "awaiting_approval",
  QUOTED: "quoted",
  QUEUED: "queued",
  GENERATING_IMAGES: "generating_images",
  GENERATING_VIDEOS: "generating_video",
  GENERATING_AUDIO: "generating_audio",
  QUALITY_CHECK: "quality_check",
  ASSEMBLING: "assembling",
  COMPLETED: "completed",
  PAUSED: "paused",
  FAILED: "failed",
  CANCELLED: "cancelled"
};

const SHOT_STATES = {
  DRAFT: "draft",
  PLANNING: "planning",
  QUOTED: "quoted",
  GENERATING_IMAGE: "generating_image",
  GENERATING_VIDEO: "generating_video",
  GENERATING_AUDIO: "generating_audio",
  QUALITY_CHECK: "quality_check",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped"
};

const VALID_TRANSITIONS = {
  [PIPELINE_STATES.DRAFT]: [PIPELINE_STATES.PLANNING],
  [PIPELINE_STATES.PLANNING]: [PIPELINE_STATES.AWAITING_APPROVAL, PIPELINE_STATES.QUOTED, PIPELINE_STATES.DRAFT],
  [PIPELINE_STATES.AWAITING_APPROVAL]: [PIPELINE_STATES.QUOTED, PIPELINE_STATES.CANCELLED],
  [PIPELINE_STATES.QUOTED]: [PIPELINE_STATES.QUEUED, PIPELINE_STATES.DRAFT],
  [PIPELINE_STATES.QUEUED]: [PIPELINE_STATES.GENERATING_IMAGES, PIPELINE_STATES.CANCELLED],
  [PIPELINE_STATES.GENERATING_IMAGES]: [PIPELINE_STATES.GENERATING_VIDEOS, PIPELINE_STATES.FAILED, PIPELINE_STATES.PAUSED],
  [PIPELINE_STATES.GENERATING_VIDEOS]: [PIPELINE_STATES.GENERATING_AUDIO, PIPELINE_STATES.FAILED, PIPELINE_STATES.PAUSED],
  [PIPELINE_STATES.GENERATING_AUDIO]: [PIPELINE_STATES.QUALITY_CHECK, PIPELINE_STATES.FAILED, PIPELINE_STATES.PAUSED],
  [PIPELINE_STATES.QUALITY_CHECK]: [PIPELINE_STATES.ASSEMBLING, PIPELINE_STATES.FAILED],
  [PIPELINE_STATES.ASSEMBLING]: [PIPELINE_STATES.COMPLETED, PIPELINE_STATES.FAILED],
  [PIPELINE_STATES.COMPLETED]: [],
  [PIPELINE_STATES.PAUSED]: [PIPELINE_STATES.QUEUED, PIPELINE_STATES.GENERATING_IMAGES, PIPELINE_STATES.GENERATING_VIDEOS, PIPELINE_STATES.GENERATING_AUDIO, PIPELINE_STATES.CANCELLED],
  [PIPELINE_STATES.FAILED]: [PIPELINE_STATES.QUEUED],
  [PIPELINE_STATES.CANCELLED]: []
};

function canTransition(from, to) {
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

async function transitionPipeline(pipelineId, toState, metadata = {}) {
  const pipeline = await prisma.directorPipeline.findUnique({ where: { id: pipelineId } });
  if (!pipeline) throw new Error("Pipeline not found");

  if (!canTransition(pipeline.status, toState)) {
    throw new Error(`Invalid state transition: ${pipeline.status} → ${toState}`);
  }

  const updated = await prisma.directorPipeline.update({
    where: { id: pipelineId },
    data: {
      status: toState,
      stateMetadata: { ...(pipeline.stateMetadata || {}), ...metadata, lastTransition: new Date().toISOString() }
    }
  });

  return updated;
}

// ──────────────────────────────────────────────
// Shot Execution
// ──────────────────────────────────────────────

async function executeShotImage(shot, pipeline, brief) {
  const shotRecord = await prisma.directorShot.upsert({
    where: { id: shot.id },
    create: {
      id: shot.id,
      pipelineId: pipeline.id,
      index: shot.index,
      title: shot.title,
      status: SHOT_STATES.GENERATING_IMAGE,
      plan: shot,
      imageResult: null,
      videoResult: null,
      audioResult: null
    },
    update: {
      status: SHOT_STATES.GENERATING_IMAGE,
      plan: shot
    }
  });

  try {
    const imagePrompt = shot.imageStrategy?.prompt || "";
    const refs = shot.imageStrategy?.references || [];

    // Build generation params
    const params = {
      prompt: imagePrompt,
      aspect_ratio: brief.aspectRatio || "9:16",
      images_list: refs.slice(0, 3), // limit refs per model capabilities
      _provider: await resolveProvider(brief.modelImage || "flux-dev")
    };

    // Choose between T2I and I2I based on references
    let result;
    if (refs.length > 0 && refs[0]) {
      params.image_url = refs[0];
      params.strength = 0.6;
      result = await generateI2I(params);
    } else {
      result = await generateImage(params);
    }

    const imageUrl = result.url || result.outputs?.[0];
    let storedUrl = imageUrl;

    if (imageUrl) {
      try {
        storedUrl = await storeMedia(imageUrl);
      } catch {
        storedUrl = `/api/media/proxy?url=${encodeURIComponent(imageUrl)}`;
      }
    }

    // Store in generation table
    await prisma.generation.create({
      data: {
        userId: pipeline.userId,
        tool: "image",
        model: brief.modelImage || "flux-dev",
        prompt: imagePrompt,
        params,
        outputUrl: storedUrl,
        status: "completed",
        creditsUsed: brief._shotCosts?.[shot.index]?.costs?.image || 2
      }
    });

    // Update shot record
    await prisma.directorShot.update({
      where: { id: shot.id },
      data: {
        imageResult: { url: storedUrl, rawUrl: imageUrl, prompt: imagePrompt },
        status: SHOT_STATES.GENERATING_VIDEO
      }
    });

    return { success: true, imageUrl: storedUrl };
  } catch (err) {
    console.error(`[Director] Shot ${shot.id} image failed:`, err.message);
    await prisma.directorShot.update({
      where: { id: shot.id },
      data: {
        status: SHOT_STATES.FAILED,
        error: err.message
      }
    });
    return { success: false, error: err.message };
  }
}

async function executeShotVideo(shot, pipeline, brief, imageUrl) {
  try {
    const videoPrompt = shot.videoStrategy?.prompt || "";
    const modelRoute = shot.videoStrategy?.modelRoute || brief.modelVideo || "wan-2.6";

    const params = {
      prompt: videoPrompt,
      aspect_ratio: brief.aspectRatio || "9:16",
      duration: shot.durationSec || 5,
      _provider: await resolveProvider(modelRoute)
    };

    let result;
    if (imageUrl) {
      // I2V — animate the generated image
      params.image_url = imageUrl;
      result = await generateI2V(params);
    } else {
      result = await generateVideo(params);
    }

    const videoUrl = result.url || result.outputs?.[0];
    let storedUrl = videoUrl;

    if (videoUrl) {
      try {
        storedUrl = await storeMedia(videoUrl);
      } catch {
        storedUrl = `/api/media/proxy?url=${encodeURIComponent(videoUrl)}`;
      }
    }

    await prisma.generation.create({
      data: {
        userId: pipeline.userId,
        tool: "video",
        model: modelRoute,
        prompt: videoPrompt,
        params,
        outputUrl: storedUrl,
        status: "completed",
        creditsUsed: brief._shotCosts?.[shot.index]?.costs?.video || 10
      }
    });

    await prisma.directorShot.update({
      where: { id: shot.id },
      data: {
        videoResult: { url: storedUrl, rawUrl: videoUrl, prompt: videoPrompt, modelRoute },
        status: SHOT_STATES.COMPLETED
      }
    });

    return { success: true, videoUrl: storedUrl };
  } catch (err) {
    console.error(`[Director] Shot ${shot.id} video failed:`, err.message);
    await prisma.directorShot.update({
      where: { id: shot.id },
      data: {
        status: SHOT_STATES.FAILED,
        error: err.message
      }
    });
    return { success: false, error: err.message };
  }
}

async function executeShotAudio(shot, pipeline, brief) {
  if (!shot.audio && brief.type !== "music_video") return { success: true, audioUrl: null };

  try {
    const audioParams = {
      prompt: shot.audio?.dialogue || brief.concept || "Background music",
      duration: shot.durationSec || 5,
      _provider: await resolveProvider(brief.modelAudio || "suno-v4")
    };

    const result = await generateAudio(audioParams);
    const audioUrl = result.url || result.outputs?.[0];
    let storedUrl = audioUrl;

    if (audioUrl) {
      try {
        storedUrl = await storeMedia(audioUrl);
      } catch {
        storedUrl = `/api/media/proxy?url=${encodeURIComponent(audioUrl)}`;
      }
    }

    await prisma.generation.create({
      data: {
        userId: pipeline.userId,
        tool: "audio",
        model: brief.modelAudio || "suno-v4",
        prompt: audioParams.prompt,
        params: audioParams,
        outputUrl: storedUrl,
        status: "completed",
        creditsUsed: brief._shotCosts?.[shot.index]?.costs?.audio || 5
      }
    });

    await prisma.directorShot.update({
      where: { id: shot.id },
      data: {
        audioResult: { url: storedUrl, rawUrl: audioUrl }
      }
    });

    return { success: true, audioUrl: storedUrl };
  } catch (err) {
    console.error(`[Director] Shot ${shot.id} audio failed:`, err.message);
    return { success: false, error: err.message };
  }
}

// ──────────────────────────────────────────────
// Full shot execution (image → video → audio)
// ──────────────────────────────────────────────
async function executeFullShot(shot, pipeline, brief) {
  // 1. Generate image
  const imageResult = await executeShotImage(shot, pipeline, brief);
  if (!imageResult.success) return { success: false, error: imageResult.error, stage: "image" };

  // 2. Generate video from image
  const videoResult = await executeShotVideo(shot, pipeline, brief, imageResult.imageUrl);
  if (!videoResult.success) return { success: false, error: videoResult.error, stage: "video", imageUrl: imageResult.imageUrl };

  // 3. Generate audio (if needed)
  const audioResult = await executeShotAudio(shot, pipeline, brief);

  return {
    success: true,
    imageUrl: imageResult.imageUrl,
    videoUrl: videoResult.videoUrl,
    audioUrl: audioResult.audioUrl
  };
}

// ──────────────────────────────────────────────
// MAIN: Execute entire production pipeline
// ──────────────────────────────────────────────
export async function executeProductionPipeline(pipelineId, userId, options = {}) {
  const pipeline = await prisma.directorPipeline.findFirst({
    where: { id: pipelineId, userId }
  });
  if (!pipeline) throw new Error("Pipeline not found");

  const plan = pipeline.plan;
  const brief = pipeline.brief || {};
  const costEstimate = pipeline.costEstimate || {};

  // Verify credits via the wallet — User.credits is a denormalized mirror
  // that session.js's syncUserCreditsFromWallet can silently overwrite.
  const wallet = await getWallet(userId);
  if (wallet.available < (costEstimate.totalCredits || 0)) {
    throw new Error(`Insufficient credits: need ${costEstimate.totalCredits}, have ${wallet.available}`);
  }

  // Transition to queued
  await transitionPipeline(pipelineId, PIPELINE_STATES.QUEUED);

  // Debit credits through the wallet ledger
  await debitWallet(userId, costEstimate.totalCredits, "Director pipeline run", `director:${pipelineId}`);

  // Save shot costs for reference
  brief._shotCosts = costEstimate.shotCosts || [];

  // Filter shots if requested
  let shots = plan.shots || [];
  if (options.shotIds?.length) {
    shots = shots.filter(s => options.shotIds.includes(s.id));
  }

  // Transition to generating_images
  await transitionPipeline(pipelineId, PIPELINE_STATES.GENERATING_IMAGES);

  const results = [];
  let creditsUsed = 0;
  let failedShots = 0;

  for (const shot of shots) {
    // Check if already completed
    const existing = await prisma.directorShot.findUnique({ where: { id: shot.id } });
    if (existing?.status === SHOT_STATES.COMPLETED && !options.rerunAll) {
      results.push({ shotId: shot.id, status: "skipped", alreadyCompleted: true });
      continue;
    }

    const result = await executeFullShot(shot, pipeline, brief);
    results.push({ shotId: shot.id, ...result });

    if (!result.success) {
      failedShots++;
      if (options.stopOnFailure && failedShots > 0) {
        await transitionPipeline(pipelineId, PIPELINE_STATES.FAILED, { failedShot: shot.id });
        // Refund remaining credits through the wallet ledger
        const remainingCredits = (costEstimate.totalCredits || 0) - creditsUsed;
        if (remainingCredits > 0) {
          await refundCredits(userId, remainingCredits, `director:${pipelineId}`, "Unexecuted shots refund");
        }
        return { success: false, error: `Shot ${shot.id} failed`, results, pipelineId, status: PIPELINE_STATES.FAILED };
      }
    }

    creditsUsed += costEstimate.shotCosts?.[shot.index]?.total || 0;
  }

  // ── Assembly ──
  let assembledUrl = null;
  const completedShots = results.filter(r => r.success);
  const videoUrls = completedShots.map(r => r.videoUrl).filter(Boolean);

  if (videoUrls.length > 1) {
    await transitionPipeline(pipelineId, PIPELINE_STATES.ASSEMBLING);
    try {
      assembledUrl = await assembleVideos(videoUrls, {
        transition: "fade",
        transitionDuration: 0.3
      });

      await prisma.directorPipeline.update({
        where: { id: pipelineId },
        data: {
          assembledUrl,
          assemblyMetadata: { shotOrder: completedShots.map(s => s.shotId) }
        }
      });
    } catch (err) {
      console.error("[Director] Assembly failed:", err.message);
      await transitionPipeline(pipelineId, PIPELINE_STATES.FAILED, { error: `Assembly failed: ${err.message}` });
      return { success: false, error: err.message, results, pipelineId, status: PIPELINE_STATES.FAILED };
    }
  } else if (videoUrls.length === 1) {
    assembledUrl = videoUrls[0];
    await prisma.directorPipeline.update({
      where: { id: pipelineId },
      data: { assembledUrl }
    });
  }

  // Mark completed
  await transitionPipeline(pipelineId, PIPELINE_STATES.COMPLETED, {
    completedShots: completedShots.length,
    failedShots,
    creditsUsed
  });

  // Store assembly as a generation record
  if (assembledUrl) {
    await prisma.generation.create({
      data: {
        userId,
        tool: "director",
        model: "assembled",
        prompt: `Production: ${pipeline.title}`,
        params: { pipelineId, shotCount: shots.length },
        outputUrl: assembledUrl,
        status: "completed",
        creditsUsed: costEstimate.assemblyCost || 0
      }
    });
  }

  return {
    success: true,
    results,
    assembledUrl,
    pipelineId,
    status: PIPELINE_STATES.COMPLETED,
    creditsUsed: costEstimate.totalCredits || creditsUsed
  };
}

// ──────────────────────────────────────────────
// Rerun a specific shot (image only, video only, or full)
// ──────────────────────────────────────────────
export async function rerunShot(pipelineId, userId, shotId, rerunType = "full") {
  const pipeline = await prisma.directorPipeline.findFirst({
    where: { id: pipelineId, userId }
  });
  if (!pipeline) throw new Error("Pipeline not found");

  const plan = pipeline.plan;
  const brief = pipeline.brief || {};
  const shot = plan.shots?.find(s => s.id === shotId);
  if (!shot) throw new Error("Shot not found in plan");

  // Get existing shot record
  const shotRecord = await prisma.directorShot.findUnique({ where: { id: shotId } });
  if (!shotRecord) throw new Error("Shot record not found");

  let result;

  switch (rerunType) {
    case "image":
      // Rerun image only
      const imageResult = await executeShotImage(shot, pipeline, brief);
      if (!imageResult.success) throw new Error(imageResult.error);
      result = { shotId, imageUrl: imageResult.imageUrl, videoUrl: shotRecord.videoResult?.url, stage: "image" };
      break;

    case "video":
      // Rerun video only (using existing image if available)
      const existingImage = shotRecord.imageResult?.url;
      const videoResult = await executeShotVideo(shot, pipeline, brief, existingImage);
      if (!videoResult.success) throw new Error(videoResult.error);
      result = { shotId, imageUrl: existingImage, videoUrl: videoResult.videoUrl, stage: "video" };
      break;

    case "audio":
      // Rerun audio only
      const audioResult = await executeShotAudio(shot, pipeline, brief);
      result = { shotId, audioUrl: audioResult.audioUrl, stage: "audio" };
      break;

    case "full":
    default:
      // Full rerun
      const fullResult = await executeFullShot(shot, pipeline, brief);
      if (!fullResult.success) throw new Error(fullResult.error);
      result = { shotId, ...fullResult, stage: "full" };
      break;
  }

  // Update pipeline metadata
  await prisma.directorPipeline.update({
    where: { id: pipelineId },
    data: {
      status: PIPELINE_STATES.COMPLETED,
      rerunHistory: [
        ...(pipeline.rerunHistory || []),
        { shotId, rerunType, timestamp: new Date().toISOString() }
      ]
    }
  });

  return { success: true, result };
}

// ──────────────────────────────────────────────
// Get pipeline status with all shot states
// ──────────────────────────────────────────────
export async function getPipelineStatus(pipelineId, userId) {
  const pipeline = await prisma.directorPipeline.findFirst({
    where: { id: pipelineId, userId }
  });
  if (!pipeline) return null;

  const shots = await prisma.directorShot.findMany({
    where: { pipelineId },
    orderBy: { index: "asc" }
  });

  return {
    pipelineId: pipeline.id,
    title: pipeline.title,
    type: pipeline.type,
    status: pipeline.status,
    plan: pipeline.plan,
    brief: pipeline.brief,
    costEstimate: pipeline.costEstimate,
    assembledUrl: pipeline.assembledUrl,
    shots: shots.map(s => ({
      id: s.id,
      index: s.index,
      title: s.title,
      status: s.status,
      plan: s.plan,
      imageResult: s.imageResult,
      videoResult: s.videoResult,
      audioResult: s.audioResult,
      error: s.error,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    })),
    stateMetadata: pipeline.stateMetadata,
    rerunHistory: pipeline.rerunHistory,
    createdAt: pipeline.createdAt,
    updatedAt: pipeline.updatedAt
  };
}

// ──────────────────────────────────────────────
// Cancel pipeline
// ──────────────────────────────────────────────
export async function cancelPipeline(pipelineId, userId) {
  const pipeline = await prisma.directorPipeline.findFirst({
    where: { id: pipelineId, userId }
  });
  if (!pipeline) throw new Error("Pipeline not found");

  if (pipeline.status === PIPELINE_STATES.COMPLETED || pipeline.status === PIPELINE_STATES.CANCELLED) {
    throw new Error("Cannot cancel pipeline in state: " + pipeline.status);
  }

  await transitionPipeline(pipelineId, PIPELINE_STATES.CANCELLED);

  // Refund any unused credits
  const completedShots = await prisma.directorShot.count({
    where: { pipelineId, status: SHOT_STATES.COMPLETED }
  });
  const totalShots = pipeline.plan?.shots?.length || 0;
  const costEstimate = pipeline.costEstimate || {};
  const perShotCost = totalShots > 0 ? Math.floor((costEstimate.totalCredits || 0) / totalShots) : 0;
  const refundAmount = (totalShots - completedShots) * perShotCost;

  if (refundAmount > 0) {
    await refundCredits(userId, refundAmount, `director:${pipelineId}`, "Cancelled pipeline refund");
  }

  return { success: true, status: PIPELINE_STATES.CANCELLED, refundAmount };
}

// ──────────────────────────────────────────────
// List all pipelines for a user
// ──────────────────────────────────────────────
export async function listPipelines(userId) {
  return prisma.directorPipeline.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      plan: true,
      costEstimate: true,
      assembledUrl: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

// Export state constants
export { PIPELINE_STATES, SHOT_STATES, VALID_TRANSITIONS, canTransition, transitionPipeline };
