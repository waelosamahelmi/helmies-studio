import prisma from "@/lib/prisma";
import { generateImage, generateI2I, generateVideo, generateI2V, generateAudio } from "@/lib/generation";
import { resolveProvider, resolveProviderWithFallback, brandError, logProviderError } from "@/lib/providers";
import { estimateCredits } from "@/lib/pricing-engine";
import { ingestFromUrl } from "@/lib/storage/ingest";
import { assembleVideos } from "@/lib/video-assembly";
import { validatePrompt, estimateDirectorCost } from "@/lib/director-planner";
import { selectEntityReferences } from "@/lib/entity-core.mjs";

/* The fallback when a pipeline names no image model. It was "flux-dev",
   which the provider answers with a 500 — so a shot that reached this
   line could never succeed. Kept as a named constant so the next person
   changing it can see it is a real, callable model and not a guess. */
const DEFAULT_IMAGE_MODEL = "seedream/5-pro-text-to-image";
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
  // The executor performs image → video → audio per shot within this one
  // "generating_images" state (it never transitions through the dedicated
  // GENERATING_VIDEOS/GENERATING_AUDIO/QUALITY_CHECK states), so ASSEMBLING
  // and COMPLETED are legitimate direct successors here — the table was
  // wrong, not the flow.
  [PIPELINE_STATES.GENERATING_IMAGES]: [PIPELINE_STATES.GENERATING_VIDEOS, PIPELINE_STATES.ASSEMBLING, PIPELINE_STATES.COMPLETED, PIPELINE_STATES.FAILED, PIPELINE_STATES.PAUSED],
  [PIPELINE_STATES.GENERATING_VIDEOS]: [PIPELINE_STATES.GENERATING_AUDIO, PIPELINE_STATES.FAILED, PIPELINE_STATES.PAUSED],
  [PIPELINE_STATES.GENERATING_AUDIO]: [PIPELINE_STATES.QUALITY_CHECK, PIPELINE_STATES.FAILED, PIPELINE_STATES.PAUSED],
  [PIPELINE_STATES.QUALITY_CHECK]: [PIPELINE_STATES.ASSEMBLING, PIPELINE_STATES.FAILED],
  [PIPELINE_STATES.ASSEMBLING]: [PIPELINE_STATES.COMPLETED, PIPELINE_STATES.FAILED],
  /* A finished scene can be shot again. It was terminal, so a re-render —
     after a bad take, or after changing the cast — was impossible without
     planning a second scene beside it. QUOTED, not QUEUED: a re-run is
     re-priced before any money moves. */
  [PIPELINE_STATES.COMPLETED]: [PIPELINE_STATES.QUOTED, PIPELINE_STATES.DRAFT],
  [PIPELINE_STATES.PAUSED]: [PIPELINE_STATES.QUEUED, PIPELINE_STATES.GENERATING_IMAGES, PIPELINE_STATES.GENERATING_VIDEOS, PIPELINE_STATES.GENERATING_AUDIO, PIPELINE_STATES.CANCELLED],
  [PIPELINE_STATES.FAILED]: [PIPELINE_STATES.QUEUED, PIPELINE_STATES.QUOTED, PIPELINE_STATES.DRAFT],
  [PIPELINE_STATES.CANCELLED]: []
};

function canTransition(from, to) {
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

// DirectorShot.id is a plain, no-default `String @id` — the executor always
// supplies it explicitly. Plan-local shot ids ("shot_000", "shot_001", …)
// are IDENTICAL across every pipeline ever planned, so writing the bare shot
// id as the row id let one pipeline's upsert match — and silently overwrite
// — a DIFFERENT pipeline's row (even a different user's). Namespacing the
// row id to its pipeline closes the collision while the plan-local id keeps
// working as the client-facing identifier (the client only ever sends the
// plan-local shot id to /api/director/rerun and /api/director/generate-shot).
// Guarded: a falsy pipelineId or shotId here means a caller lost track of
// which pipeline/shot it's addressing — exactly how this bug class starts —
// so fail loudly instead of silently building a garbage row id.
export function shotRowId(pipelineId, shotId) {
  if (!pipelineId) throw new Error("shotRowId: pipelineId is required");
  if (!shotId) throw new Error("shotRowId: shotId is required");
  return `${pipelineId}::${shotId}`;
}

// Strip the resolved `_provider` adapter before persisting generation params.
// It carries function values (Prisma 7 refuses to serialize them into a Json
// column — every Generation write here crashed on it) AND the provider's API
// key, which must never land in the database. Found by
// tests/integration/director-generate-shot.int.test.mjs.
function persistableParams(params) {
  const { _provider, ...rest } = params || {};
  return rest;
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
// Character reference threading (E4.3)
// ──────────────────────────────────────────────

// Token-safe identifier for a character name: "The Night Courier" →
// "The_Night_Courier". Mirrors the $CHARACTER_<name> tokens the planner's
// LLM contract and heuristic builder emit (director-planner.js keeps its own
// copy of this 2-liner rather than importing across the executor/planner
// boundary — the two files already import in the other direction).
export function characterSlug(name) {
  return String(name || "").trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const CHARACTER_TOKEN_PREFIX = "$CHARACTER_";

// Resolve a shot's imageStrategy.references. $CHARACTER_<name> tokens become
// real image URLs — the character's uploaded reference first, then the
// pipeline's rolling reference (the first completed shot image that
// contained the character). Tokens with no image yet are returned as
// `pending`: the caller seeds the rolling reference from this shot's own
// completed image. Plain URLs pass through untouched.
export function resolveCharacterReferences(refs, characters = [], rollingRefs = {}) {
  const urls = [];
  const pending = [];
  for (const ref of refs || []) {
    if (typeof ref !== "string" || !ref) continue;
    if (!ref.startsWith(CHARACTER_TOKEN_PREFIX)) {
      urls.push(ref);
      continue;
    }
    // Token may carry a trailing annotation ("$CHARACTER_Mara — ...") — the
    // name is everything up to the first whitespace.
    const raw = ref.slice(CHARACTER_TOKEN_PREFIX.length).split(/\s/)[0];
    const slug = characterSlug(raw);
    if (!slug) continue;
    const match = (characters || []).find(
      (c) => characterSlug(c?.name).toLowerCase() === slug.toLowerCase()
    );
    const rolling =
      rollingRefs[slug] ??
      rollingRefs[characterSlug(match?.name)] ??
      Object.entries(rollingRefs || {}).find(([k]) => k.toLowerCase() === slug.toLowerCase())?.[1];
    const url = match?.referenceUrl || rolling;
    if (url) {
      urls.push(url);
    } else {
      pending.push(characterSlug(match?.name) || slug);
    }
  }
  return { urls, pending };
}

// Store this shot's completed image as the rolling reference for each
// still-unreferenced character it contained — SET ONCE: the first completed
// image wins; later shots only ever read it.
async function seedRollingCharacterRefs(pipelineId, slugs, url) {
  if (!slugs?.length || !url) return;
  const row = await prisma.directorPipeline.findUnique({ where: { id: pipelineId } });
  if (!row) return;
  const current = row.stateMetadata?.characterRefs || {};
  const additions = {};
  for (const slug of slugs) {
    if (!current[slug]) additions[slug] = url;
  }
  if (!Object.keys(additions).length) return;
  await prisma.directorPipeline.update({
    where: { id: pipelineId },
    data: {
      stateMetadata: {
        ...(row.stateMetadata || {}),
        characterRefs: { ...current, ...additions },
      },
    },
  });
}

// ──────────────────────────────────────────────
// Shot Execution
// ──────────────────────────────────────────────

async function executeShotImage(shot, pipeline, brief) {
  const rowId = shotRowId(pipeline.id, shot.id);
  const shotRecord = await prisma.directorShot.upsert({
    where: { id: rowId },
    create: {
      id: rowId,
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
    const rawRefs = shot.imageStrategy?.references || [];

    // E4.3: $CHARACTER_<name> tokens → real image URLs (upload first, then
    // the pipeline's rolling reference). The rolling refs are re-read fresh
    // from the DB when tokens are present — during a full pipeline run the
    // `pipeline` object was fetched once up front, and an earlier shot in
    // this same run may have just seeded a reference.
    let refs = rawRefs;
    let pendingCharacters = [];
    if (rawRefs.some((r) => typeof r === "string" && r.startsWith(CHARACTER_TOKEN_PREFIX))) {
      let rollingRefs = pipeline.stateMetadata?.characterRefs || {};
      try {
        const fresh = await prisma.directorPipeline.findUnique({ where: { id: pipeline.id } });
        rollingRefs = fresh?.stateMetadata?.characterRefs || rollingRefs;
      } catch { /* fall back to the snapshot */ }
      ({ urls: refs, pending: pendingCharacters } = resolveCharacterReferences(
        rawRefs,
        brief.characters || [],
        rollingRefs
      ));
    }

    /* THE CAST OF THIS SHOT.
       Every shot the screenplay breakdown produces carries `entityIds` —
       the real characters and places, with reference photographs on file.
       Nothing here read them, so a scene planned around Wael rendered a
       stranger: the director only understood $CHARACTER_ tokens, which
       the breakdown does not emit. Their references are pulled in here and
       joined with whatever the plan already listed. */
    if (Array.isArray(shot.entityIds) && shot.entityIds.length) {
      try {
        const entities = await prisma.studioEntity.findMany({
          where: { id: { in: shot.entityIds.slice(0, 6) }, userId: pipeline.userId },
        });
        const fromCast = entities.flatMap((e) =>
          selectEntityReferences(e, { purpose: "default", max: 2 }).map((r) => r.url));
        refs = [...new Set([...refs.filter(Boolean), ...fromCast])];
      } catch (err) {
        console.error("[Director] entity references failed:", err?.message);
      }
    }

    /* THE MODEL THE PROJECT CHOSE.
       This was `brief.modelImage || "flux-dev"` — and nothing ever set
       brief.modelImage, so every director shot rendered on a hardcoded
       default whatever the project had been configured with. flux-dev is
       also one of the ids the provider answers with a 500, which is why
       all four shots of scene 1 failed. */
    const wantModel = brief.modelImage || DEFAULT_IMAGE_MODEL;

    // Build generation params
    const params = {
      prompt: imagePrompt,
      aspect_ratio: brief.aspectRatio || "9:16",
      images_list: refs.slice(0, 3), // limit refs per model capabilities
      model: wantModel,
      _provider: await resolveProvider(wantModel)
    };

    // Choose between T2I and I2I based on references
    let result;
    if (refs.length > 0 && refs[0]) {
      params.image_url = refs[0];
      params.image_urls = refs.slice(0, 3);
      params.strength = 0.6;
      result = await generateI2I(params);
    } else {
      result = await generateImage(params);
    }

    const imageUrl = result.url || result.outputs?.[0];
    let storedUrl = imageUrl;

    if (imageUrl) {
      try {
        ({ url: storedUrl } = await ingestFromUrl(imageUrl));
      } catch {
        storedUrl = `/api/media/proxy?url=${encodeURIComponent(imageUrl)}`;
      }
    }

    // Store in generation table
    await prisma.generation.create({
      data: {
        userId: pipeline.userId,
        tool: "image",
        model: brief.modelImage || DEFAULT_IMAGE_MODEL,
        prompt: imagePrompt,
        params: persistableParams(params),
        outputUrl: storedUrl,
        status: "completed",
        creditsUsed: brief._shotCosts?.[shot.index]?.costs?.image || 2
      }
    });

    // Update shot record
    await prisma.directorShot.update({
      where: { id: rowId },
      data: {
        imageResult: { url: storedUrl, rawUrl: imageUrl, prompt: imagePrompt },
        status: SHOT_STATES.GENERATING_VIDEO
      }
    });

    // E4.3: this completed image becomes the rolling reference for any
    // character in the shot that had none yet — later shots anchor to it.
    if (pendingCharacters.length) {
      try {
        await seedRollingCharacterRefs(pipeline.id, pendingCharacters, storedUrl);
      } catch (seedErr) {
        // Never fail a successful shot over reference bookkeeping.
        console.error(`[Director] Rolling character ref write failed for ${pipeline.id}:`, seedErr.message);
      }
    }

    return { success: true, imageUrl: storedUrl };
  } catch (err) {
    console.error(`[Director] Shot ${shot.id} image failed:`, err.message);
    await prisma.directorShot.update({
      where: { id: rowId },
      data: {
        status: SHOT_STATES.FAILED,
        error: err.message
      }
    });
    return { success: false, error: err.message };
  }
}

async function executeShotVideo(shot, pipeline, brief, imageUrl) {
  const rowId = shotRowId(pipeline.id, shot.id);
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
        ({ url: storedUrl } = await ingestFromUrl(videoUrl));
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
        params: persistableParams(params),
        outputUrl: storedUrl,
        status: "completed",
        creditsUsed: brief._shotCosts?.[shot.index]?.costs?.video || 10
      }
    });

    await prisma.directorShot.update({
      where: { id: rowId },
      data: {
        videoResult: { url: storedUrl, rawUrl: videoUrl, prompt: videoPrompt, modelRoute },
        status: SHOT_STATES.COMPLETED
      }
    });

    return { success: true, videoUrl: storedUrl };
  } catch (err) {
    console.error(`[Director] Shot ${shot.id} video failed:`, err.message);
    await prisma.directorShot.update({
      where: { id: rowId },
      data: {
        status: SHOT_STATES.FAILED,
        error: err.message
      }
    });
    return { success: false, error: err.message };
  }
}

async function executeShotAudio(shot, pipeline, brief) {
  // E4.2: `shot.dialogue` is the plan-shape field (the LLM contract keeps
  // `audio` null, so the old shot.audio.dialogue read was unreachable in
  // practice). A shot with dialogue always attempts audio.
  if (!shot.audio && !shot.dialogue && brief.type !== "music_video") return { success: true, audioUrl: null };

  try {
    const audioParams = {
      prompt: shot.dialogue || shot.audio?.dialogue || brief.concept || "Background music",
      duration: shot.durationSec || 5,
      _provider: await resolveProvider(brief.modelAudio || "suno-v4")
    };

    const result = await generateAudio(audioParams);
    const audioUrl = result.url || result.outputs?.[0];
    let storedUrl = audioUrl;

    if (audioUrl) {
      try {
        ({ url: storedUrl } = await ingestFromUrl(audioUrl));
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
        params: persistableParams(audioParams),
        outputUrl: storedUrl,
        status: "completed",
        creditsUsed: brief._shotCosts?.[shot.index]?.costs?.audio || 5
      }
    });

    await prisma.directorShot.update({
      where: { id: shotRowId(pipeline.id, shot.id) },
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

  // 3. Generate audio (if needed). executeShotAudio itself already encodes
  // "no audio requested" as { success: true, audioUrl: null } — it only
  // returns { success: false } when audio was actually attempted (shot.audio
  // set, or brief.type === "music_video") and generation failed — so this
  // check can never misfire on a shot that legitimately has no audio.
  const audioResult = await executeShotAudio(shot, pipeline, brief);
  if (!audioResult.success) {
    return { success: false, error: audioResult.error || "Audio generation failed", stage: "audio", imageUrl: imageResult.imageUrl, videoUrl: videoResult.videoUrl };
  }

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
  let costEstimate = pipeline.costEstimate || {};

  /* NEVER RUN A PLAN NOBODY PRICED.
     The executor debits `costEstimate.totalCredits`, so a plan that was
     never quoted debits ZERO and renders the whole scene for free — which
     is what a scene built by the screenplay breakdown would have done,
     because that path creates the shots without pricing them. An unpriced
     plan is priced here rather than run at zero. */
  if (!(costEstimate.totalCredits > 0)) {
    costEstimate = await estimateDirectorCost(plan, brief);
    await prisma.directorPipeline.update({ where: { id: pipelineId }, data: { costEstimate } });
  }

  // Verify credits via the wallet — User.credits is a denormalized mirror
  // that session.js's syncUserCreditsFromWallet can silently overwrite.
  const wallet = await getWallet(userId);
  if (wallet.available < (costEstimate.totalCredits || 0)) {
    throw new Error(`Insufficient credits: need ${costEstimate.totalCredits}, have ${wallet.available}`);
  }

  /* QUOTED is the state that says "this has a price". The machine only
     allows planning → quoted → queued, and the executor jumped straight to
     queued — so a scene sitting in `planning` (which is how every scene
     the breakdown creates starts) failed with "Invalid state transition".
     Walk the step rather than widening the machine: the intermediate state
     is the record that a price existed before any money moved. */
  const needsQuote = [
    PIPELINE_STATES.PLANNING,
    PIPELINE_STATES.AWAITING_APPROVAL,
    PIPELINE_STATES.COMPLETED,
    PIPELINE_STATES.FAILED,
  ];
  if (needsQuote.includes(pipeline.status)) {
    await transitionPipeline(pipelineId, PIPELINE_STATES.QUOTED);
  }

  // Transition to queued
  await transitionPipeline(pipelineId, PIPELINE_STATES.QUEUED);

  // Debit credits through the wallet ledger
  await debitWallet(userId, costEstimate.totalCredits, "Director pipeline run", `director:${pipelineId}`);

  // Declared ahead of the try block so the crash safety net below can
  // compute the un-consumed remainder no matter where execution stops.
  let creditsUsed = 0;

  try {
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
    let failedShots = 0;

    for (const shot of shots) {
      // Check if already completed
      const existing = await prisma.directorShot.findUnique({ where: { id: shotRowId(pipelineId, shot.id) } });
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
        // A failed shot consumed NOTHING. Counting it as used is what made
        // a scene whose four shots all failed still bill 53 credits: the
        // whole estimate was debited up front, `creditsUsed` was
        // incremented for every shot regardless of outcome, and the
        // end-of-run refund of (total - used) therefore refunded nothing.
        // Failed work is never charged.
        continue;
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
        // E4.4: assembly honors each shot's own `transition` (how it cuts
        // INTO the next shot) — the old options.transition:"fade" here was
        // read and silently ignored by the previous assembleVideos.
        const shotById = new Map((plan.shots || []).map(s => [s.id, s]));
        const withVideo = completedShots.filter(r => r.videoUrl);
        const transitions = withVideo
          .slice(0, -1)
          .map(r => {
            const t = shotById.get(r.shotId)?.transition;
            return ["cut", "fade", "dissolve"].includes(t) ? t : "cut";
          });
        assembledUrl = await assembleVideos(
          { clips: videoUrls.map(url => ({ url })), transitions },
          { transitionDuration: 0.3 }
        );

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

    /* A scene where NOTHING rendered is not completed.
       Marking it "completed" made a run whose every shot failed read as a
       finished scene — and then refused to run again, because COMPLETED is
       terminal. The state has to match what happened. */
    const nothingWorked = failedShots > 0 && completedShots.length === 0;
    await transitionPipeline(
      pipelineId,
      nothingWorked ? PIPELINE_STATES.FAILED : PIPELINE_STATES.COMPLETED,
      { completedShots: completedShots.length, failedShots, creditsUsed },
    );

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

    /* Give back what was not spent.

       The whole estimate is debited up front, and until now the ONLY paths
       that returned the remainder were stopOnFailure and a crash. A run
       that finished with some shots failed simply kept the difference —
       which is how four failed shots cost 53 credits. Every exit now
       settles: charged for what ran, refunded for what did not. */
    const unspent = (costEstimate.totalCredits || 0) - creditsUsed;
    if (unspent > 0) {
      try {
        await refundCredits(userId, unspent, `director:${pipelineId}`, "Shots that did not run");
      } catch (refundErr) {
        console.error("[Director] Refund of unspent credits failed:", {
          pipelineId, userId, unspent, err: refundErr?.message,
        });
      }
    }

    return {
      success: true,
      results,
      assembledUrl,
      pipelineId,
      status: PIPELINE_STATES.COMPLETED,
      // What was actually consumed — NOT the estimate. Reporting the
      // estimate told the user they had spent money the refund above just
      // gave back.
      creditsUsed,
      creditsRefunded: unspent > 0 ? unspent : 0,
    };
  } catch (err) {
    // Crash safety net: the debit above has already charged the user, so an
    // unexpected throw anywhere past this point (a DB error, a state-machine
    // rejection, an unhandled provider error, etc.) must not leave them
    // charged for work that never happened. Refund the un-consumed
    // remainder using the same math as the stopOnFailure branch, best-effort
    // mark the pipeline FAILED, then propagate the original error.
    console.error("[Director] Pipeline crashed after debit:", err.message);
    const remainder = (costEstimate.totalCredits || 0) - creditsUsed;
    if (remainder > 0) {
      try {
        await refundCredits(userId, remainder, `director:${pipelineId}`, "Pipeline crashed — unexecuted work refunded");
      } catch (refundErr) {
        // The refund itself failed (e.g. a transient DB error) — the user is
        // now owed credits with no automatic recovery. Must not let this
        // mask the original crash error or skip the FAILED-transition
        // attempt below, so log loudly with everything an operator needs to
        // reconcile manually and fall through.
        console.error(
          `[Director] CRASH REFUND FAILED — user is owed ${remainder} credits. userId=${userId} pipelineId=${pipelineId} remainder=${remainder}:`,
          refundErr.message
        );
      }
    }
    try {
      await transitionPipeline(pipelineId, PIPELINE_STATES.FAILED, { error: err.message });
    } catch (transitionErr) {
      console.error("[Director] Failed to mark crashed pipeline FAILED:", transitionErr.message);
    }
    throw err;
  }
}

// ──────────────────────────────────────────────
// Per-shot generation BEFORE full execution (E4.2)
// ──────────────────────────────────────────────

// The kinds a planned-but-unexecuted shot can generate on its own. Audio is
// deliberately absent: pre-execution audio belongs to the full pipeline run
// (music) or an audio rerun on an executed shot (dialogue).
export const VALID_SHOT_ASSET_KINDS = ["image", "video"];

// Pipeline statuses during which per-shot generation must not run — the
// inline pipeline run owns the shots (and the money) while any of these is
// current.
const EXECUTING_STATUSES = new Set([
  PIPELINE_STATES.QUEUED,
  PIPELINE_STATES.GENERATING_IMAGES,
  PIPELINE_STATES.GENERATING_VIDEOS,
  PIPELINE_STATES.GENERATING_AUDIO,
  PIPELINE_STATES.QUALITY_CHECK,
  PIPELINE_STATES.ASSEMBLING,
]);

// Generate ONE asset (image or video) for ONE planned shot, before any full
// execution. Money invariant: debits EXACTLY that shot's server-quoted cost
// for that kind (pipeline.costEstimate.shotCosts — never a client number),
// refunds on failure, and — unlike rerunShot, which requires an existing
// DirectorShot row — creates the row when this is the shot's first work.
export async function generateShotAsset(pipelineId, userId, shotId, kind) {
  if (!VALID_SHOT_ASSET_KINDS.includes(kind)) {
    throw new Error(`Invalid kind: ${kind}`);
  }

  const pipeline = await prisma.directorPipeline.findFirst({
    where: { id: pipelineId, userId }
  });
  if (!pipeline) throw new Error("Pipeline not found");
  if (EXECUTING_STATUSES.has(pipeline.status)) {
    throw new Error("Pipeline is executing — wait for the run to finish before generating single shots");
  }

  const plan = pipeline.plan;
  const brief = pipeline.brief || {};
  const shot = plan?.shots?.find(s => s.id === shotId);
  if (!shot) throw new Error("Shot not found in plan");

  // Exactly this shot's quoted cost for this kind. Prefer the by-shotId
  // entry (edits re-index shots, so identity beats position), then the
  // positional entry, then the even-split fallback rerunShot also uses.
  const costRow = pipeline.costEstimate?.shotCosts?.find?.(c => c.shotId === shotId)
    || pipeline.costEstimate?.shotCosts?.[shot.index];
  let cost = costRow?.costs?.[kind];
  if (!cost) {
    const totalShots = plan.shots?.length || 0;
    cost = Math.ceil((pipeline.costEstimate?.totalCredits || 0) / Math.max(1, totalShots));
  }

  await debitWallet(userId, cost, `Director shot generate (${kind})`, `director:${pipelineId}:generate`);

  // Keep the Generation-row bookkeeping accurate (same trick as
  // executeProductionPipeline).
  brief._shotCosts = pipeline.costEstimate?.shotCosts || [];

  const rowId = shotRowId(pipeline.id, shot.id);

  try {
    const existing = await prisma.directorShot.findUnique({ where: { id: rowId } });

    if (kind === "image") {
      // executeShotImage upserts the DirectorShot row itself.
      const imageResult = await executeShotImage(shot, pipeline, brief);
      if (!imageResult.success) throw new Error(imageResult.error);
      // executeShotImage leaves the shot in GENERATING_VIDEO (its pipeline
      // meaning is "image done, video next") — a standalone image isn't
      // "generating video", so settle the row into an honest resting state.
      await prisma.directorShot.update({
        where: { id: rowId },
        data: { status: existing?.videoResult ? SHOT_STATES.COMPLETED : SHOT_STATES.DRAFT }
      });
      return { shotId, kind, imageUrl: imageResult.imageUrl, creditsUsed: cost };
    }

    // kind === "video": executeShotVideo only UPDATEs the DirectorShot row,
    // so create it first when this is the shot's first generated asset.
    if (!existing) {
      await prisma.directorShot.create({
        data: {
          id: rowId,
          pipelineId: pipeline.id,
          index: shot.index,
          title: shot.title,
          status: SHOT_STATES.DRAFT,
          plan: shot,
          imageResult: null,
          videoResult: null,
          audioResult: null
        }
      });
    }
    const imageUrl = existing?.imageResult?.url || null;
    const videoResult = await executeShotVideo(shot, pipeline, brief, imageUrl);
    if (!videoResult.success) throw new Error(videoResult.error);
    return { shotId, kind, videoUrl: videoResult.videoUrl, imageUrl, creditsUsed: cost };
  } catch (err) {
    // Same refund discipline as rerunShot: the user must never stay billed
    // for work that never happened, and a refund failure must never mask the
    // original error.
    try {
      await refundCredits(userId, cost, `director:${pipelineId}:generate`, "Failed per-shot generation refund");
    } catch (refundErr) {
      console.error(
        `[Director] GENERATE-SHOT REFUND FAILED — user is owed ${cost} credits. userId=${userId} pipelineId=${pipelineId} shotId=${shotId} kind=${kind}:`,
        refundErr.message
      );
    }
    throw err;
  }
}

// ──────────────────────────────────────────────
// Rerun a specific shot (image only, video only, or full)
// ──────────────────────────────────────────────

// Canonical rerun types — the single source of truth for both the cost path
// below and the execution switch, and re-exported so the route can validate
// client input against the exact same set before ever calling in. Previously
// the two disagreed on what counted as "unrecognized": the cost path only
// special-cased `=== "full"` (anything else fell through to a per-shot
// shotCosts[rerunType] lookup, `undefined` for a bogus type, then the
// pipeline-wide average fallback below), while the execution switch's
// `default` treated anything unrecognized as a full (image+video+audio)
// rerun. A bogus rerunType therefore billed the cheap average while
// performing the expensive full rerun — an under-charge. Validating against
// this shared list, defensively, keeps the two paths from ever disagreeing
// again — including for callers other than the HTTP route, since this
// function is exported and callable directly.
export const VALID_RERUN_TYPES = ["image", "video", "audio", "full"];

export async function rerunShot(pipelineId, userId, shotId, rerunType = "full") {
  if (!VALID_RERUN_TYPES.includes(rerunType)) {
    throw new Error(`Invalid rerunType: ${rerunType}`);
  }

  const pipeline = await prisma.directorPipeline.findFirst({
    where: { id: pipelineId, userId }
  });
  if (!pipeline) throw new Error("Pipeline not found");

  const plan = pipeline.plan;
  const brief = pipeline.brief || {};
  const shot = plan.shots?.find(s => s.id === shotId);
  if (!shot) throw new Error("Shot not found in plan");

  // Get existing shot record
  const shotRecord = await prisma.directorShot.findUnique({ where: { id: shotRowId(pipelineId, shotId) } });
  if (!shotRecord) throw new Error("Shot record not found");

  // Charge before regenerating — a rerun is new work on top of what the
  // pipeline's original executeProductionPipeline debit already paid for,
  // and was previously free. Prefer the per-shot, per-type cost recorded at
  // quote time; for a full rerun that means summing whichever of the
  // image/video/audio entries are present. Fall back to an even split of
  // the pipeline's total when no per-shot breakdown is available.
  const shotCosts = pipeline.costEstimate?.shotCosts?.[shot.index]?.costs;
  let cost = rerunType === "full"
    ? shotCosts && ((shotCosts.image || 0) + (shotCosts.video || 0) + (shotCosts.audio || 0))
    : shotCosts?.[rerunType];
  if (!cost) {
    const totalShots = plan.shots?.length || 0;
    cost = Math.ceil((pipeline.costEstimate?.totalCredits || 0) / Math.max(1, totalShots));
  }
  await debitWallet(userId, cost, `Director shot rerun (${rerunType})`, `director:${pipelineId}:rerun`);

  let result;

  try {
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
        if (!audioResult.success) throw new Error(audioResult.error || "Audio generation failed");
        result = { shotId, audioUrl: audioResult.audioUrl, stage: "audio" };
        break;

      case "full":
      default:
        // Full rerun. `default` is unreachable other than via "full" now that
        // rerunType is validated against VALID_RERUN_TYPES above — kept only
        // as a defensive fallback, not as the "anything unrecognized" catch-all
        // it used to be (that's what let a bogus rerunType diverge from the
        // cost path above).
        const fullResult = await executeFullShot(shot, pipeline, brief);
        if (!fullResult.success) throw new Error(fullResult.error);
        result = { shotId, ...fullResult, stage: "full" };
        break;
    }
  } catch (err) {
    // The debit above has already charged the user for this rerun — mirror
    // executeProductionPipeline's crash safety net (see the catch block of
    // executeProductionPipeline) so a provider failure here doesn't leave
    // the user permanently billed for work that never happened. Guard the
    // refund itself so a refund failure can't mask the original error.
    try {
      await refundCredits(userId, cost, `director:${pipelineId}:rerun`, "Failed rerun refund");
    } catch (refundErr) {
      console.error(
        `[Director] RERUN REFUND FAILED — user is owed ${cost} credits. userId=${userId} pipelineId=${pipelineId} shotId=${shotId} rerunType=${rerunType}:`,
        refundErr.message
      );
    }
    throw err;
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
      // Row id is namespaced (shotRowId) — expose the plan-local id too, the
      // same shape the HTTP status route returns (see its comment).
      shotId: s.plan?.id ?? null,
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
