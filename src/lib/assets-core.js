// Helmies Studio — Shared generation → Asset writer (Q1.1 / A1.4.3)
//
// Worker-safe (relative imports only). Historically only the SYNC generation
// handler wrote Asset rows, so durable-queue generations (agent steps,
// template steps, async studio submits) never appeared in the library as
// first-class assets — no favorite/delete/lineage. This module is the single
// writer every success path funnels through.
//
// Idempotency: keyed on generationId — a replay (webhook + worker racing)
// finds the existing row and does nothing.

import prisma from "./prisma.js";
import { log } from "./log.js";

// "director" is an ASSEMBLED SCENE — the cut of a whole scene's shots, and
// the thing somebody actually came for. Absent from this set it was typed
// as an image and would have shown up in the library as a broken thumbnail.
const VIDEO_TOOLS = new Set(["video", "i2v", "v2v", "lipsync", "recast", "marketing", "director"]);
const AUDIO_TOOLS = new Set(["audio", "music", "voiceover"]);

export function assetTypeForTool(tool) {
  if (VIDEO_TOOLS.has(tool)) return "video";
  if (AUDIO_TOOLS.has(tool)) return "audio";
  return "image";
}

// generation: a completed Generation row (needs userId, id, tool, model,
// prompt, params, outputUrl). Never throws — asset history must not fail a
// terminal money transition.
export async function recordGenerationAsset(generation, { source = "generation" } = {}) {
  try {
    if (!generation?.id || !generation?.outputUrl) return null;
    const existing = await prisma.asset.findFirst({ where: { generationId: generation.id }, select: { id: true } });
    if (existing) return existing;

    const params = generation.params && typeof generation.params === "object" ? generation.params : {};

    /* Which production this belongs to.

       The column was read from `params.projectId` and NOTHING ever set it,
       so every frame rendered for a project's cast landed in the library
       unfiled and the project's Assets tab stayed empty however much had
       been made for it. The entities in the shot already know their
       project, so it is resolved here rather than threaded through the
       client — which also means the agent and the director get it without
       changing either. Deliberately NOT put into the params sent upstream:
       providers reject fields they do not know.

       Only when the cast agrees. A shot mixing two projects belongs to
       neither, and guessing one would file work under the wrong film. */
    let projectId = params.projectId || null;
    if (!projectId && Array.isArray(params.entityIds) && params.entityIds.length) {
      const entities = await prisma.studioEntity.findMany({
        where: { id: { in: params.entityIds }, userId: generation.userId },
        select: { projectId: true },
      });
      const projects = [...new Set(entities.map((e) => e.projectId).filter(Boolean))];
      if (projects.length === 1) projectId = projects[0];
    }
    const inputUrl = params.image_url || params.video_url || params.audio_url || null;
    const parentAssetId = inputUrl
      ? (await prisma.asset.findFirst({ where: { userId: generation.userId, url: inputUrl }, select: { id: true } }))?.id ?? null
      : null;

    const asset = await prisma.asset.create({
      data: {
        userId: generation.userId,
        type: assetTypeForTool(generation.tool),
        source,
        url: generation.outputUrl,
        name: (generation.prompt || "").slice(0, 80) || null,
        model: generation.model || null,
        generationId: generation.id,
        parentAssetId,
        projectId,
        metadata: {
          tool: generation.tool,
          prompt: generation.prompt || "",
          creditsUsed: generation.creditsUsed || 0,
          entityIds: Array.isArray(params.entityIds) ? params.entityIds : [],
        },
      },
    });

    if (parentAssetId) {
      await prisma.assetRelation
        .create({ data: { fromAssetId: parentAssetId, toAssetId: asset.id, type: "derived" } })
        .catch(() => {}); // unique pair — a replay simply finds it there
    }
    return asset;
  } catch (err) {
    log.error("asset_record_failed", { generationId: generation?.id, err });
    return null;
  }
}
