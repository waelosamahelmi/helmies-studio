// Helmies Studio — Projects (P1.1).
//
// A project is the container a production actually lives in: its type, its
// scenario, the format every shot inherits, and the cast, environments,
// assets and sessions that belong to it. The table has existed since the
// Phase 0 migration and was never written to — "Projects" in the rail opened
// ProjectMemory, which is a different thing entirely.
//
// Owner-scoped throughout: a miss reads as not-found rather than forbidden,
// so an id probe can never confirm somebody else's project exists.
import prisma from "./prisma.js";

// What kind of thing is being made. This is not decoration — it decides what
// a scene means (an episode in a series, a cut in an ad), which is why it is
// asked for once at the top rather than inferred per shot.
// `directorType` is how a scene reaches the planner: a scene IS a
// DirectorPipeline filed under the project, so the production presets
// (shots per section, pacing, whether audio is required) come from the
// project's kind instead of being asked again per scene.
export const PROJECT_KINDS = [
  { value: "movie", label: "Film", unit: "scene", directorType: "short_film",
    blurb: "A single story told in scenes." },
  { value: "series", label: "Series", unit: "episode", directorType: "short_film",
    blurb: "Episodes that share a cast and a world." },
  { value: "social", label: "Social video", unit: "cut", directorType: "social_campaign",
    blurb: "Short vertical pieces for feeds." },
  { value: "ad", label: "Ad", unit: "cut", directorType: "ad_product",
    blurb: "A campaign deliverable with a product at its centre." },
  { value: "branding", label: "Branding", unit: "piece", directorType: "social_campaign",
    blurb: "Identity work — a look, not a story." },
];

export const PROJECT_KIND_VALUES = PROJECT_KINDS.map((k) => k.value);
export const kindOf = (v) => PROJECT_KINDS.find((k) => k.value === v) || PROJECT_KINDS[0];

const ASPECTS = ["9:16", "16:9", "1:1", "4:5", "2.39:1", "21:9"];
const RESOLUTIONS = ["480p", "720p", "1080p", "4k"];

const MAX_NAME = 120;
const MAX_BRIEF = 40000; // a feature screenplay fits

// Format lives on the project so no individual shot has to be told it. Every
// generation in the project inherits these unless it overrides them.
export function normalizeSettings(input = {}, previous = {}) {
  const out = { ...previous };
  if (input.kind !== undefined) out.kind = PROJECT_KIND_VALUES.includes(input.kind) ? input.kind : "movie";
  if (input.aspectRatio !== undefined && ASPECTS.includes(input.aspectRatio)) out.aspectRatio = input.aspectRatio;
  if (input.resolution !== undefined && RESOLUTIONS.includes(input.resolution)) out.resolution = input.resolution;
  if (input.imageModel !== undefined) out.imageModel = String(input.imageModel || "").slice(0, 120) || null;
  if (input.videoModel !== undefined) out.videoModel = String(input.videoModel || "").slice(0, 120) || null;
  if (input.voiceModel !== undefined) out.voiceModel = String(input.voiceModel || "").slice(0, 120) || null;
  /* How a shot is made.
     "auto"       — straight to video when the video model can be shown the
                    cast itself (seedance 2.5 and friends take
                    reference_image_urls), still-first when it can only be
                    given a frame.
     "storyboard" — always render the still and approve it before paying
                    for a clip. Slower and dearer, but a wrong face costs
                    an image instead of a video. */
  if (input.videoMode !== undefined) {
    out.videoMode = ["auto", "storyboard"].includes(input.videoMode) ? input.videoMode : "auto";
  }
  return {
    kind: out.kind || "movie",
    aspectRatio: out.aspectRatio || "16:9",
    resolution: out.resolution || "720p",
    imageModel: out.imageModel ?? null,
    videoModel: out.videoModel ?? null,
    voiceModel: out.voiceModel ?? null,
    videoMode: out.videoMode || "auto",
    // Carried, never taken from input: the assembled piece is written by
    // the movie route, and changing the aspect ratio must not erase it.
    ...(previous.movieUrl ? { movieUrl: previous.movieUrl } : {}),
    ...(previous.movieBuiltAt ? { movieBuiltAt: previous.movieBuiltAt } : {}),
    ...(previous.movieMeta ? { movieMeta: previous.movieMeta } : {}),
    ...(previous.breakdown ? { breakdown: previous.breakdown } : {}),
  };
}

export function validateProjectPayload(body = {}, { partial = false } = {}) {
  const errors = [];
  const value = {};

  if (!partial || body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) errors.push("A name is required.");
    else if (name.length > MAX_NAME) errors.push(`The name must be ${MAX_NAME} characters or fewer.`);
    else value.name = name;
  }

  if (body.description !== undefined) {
    value.description = body.description ? String(body.description).slice(0, 2000) : null;
  }
  // The scenario. Long on purpose: this is where a whole screenplay lives, and
  // it is what lets every later step be prefilled instead of re-asked.
  if (body.brief !== undefined) {
    if (typeof body.brief === "string" && body.brief.length > MAX_BRIEF) {
      errors.push("That scenario is too long to store.");
    } else {
      value.brief = body.brief ? String(body.brief) : null;
    }
  }
  if (body.status !== undefined) {
    if (!["active", "archived"].includes(body.status)) errors.push("Unknown status.");
    else value.status = body.status;
  }

  return { valid: errors.length === 0, errors, value };
}

export async function listProjects(userId, { status = null, limit = 50 } = {}) {
  return prisma.project.findMany({
    where: { userId, ...(status ? { status } : {}) },
    orderBy: { updatedAt: "desc" },
    take: Math.min(Math.max(1, limit), 100),
  });
}

export async function getOwnedProject(userId, id) {
  if (!id) return null;
  return prisma.project.findFirst({ where: { id, userId } });
}

export async function createProject(userId, body = {}) {
  const { valid, errors, value } = validateProjectPayload(body);
  if (!valid) {
    const err = new Error(errors[0]);
    err.code = "invalid_params";
    err.errors = errors;
    throw err;
  }
  return prisma.project.create({
    data: {
      userId,
      name: value.name,
      description: value.description ?? null,
      brief: value.brief ?? null,
      status: "active",
      data: normalizeSettings(body.settings || body),
    },
  });
}

export async function updateProject(userId, id, body = {}) {
  const existing = await getOwnedProject(userId, id);
  if (!existing) return null;

  const { valid, errors, value } = validateProjectPayload(body, { partial: true });
  if (!valid) {
    const err = new Error(errors[0]);
    err.code = "invalid_params";
    err.errors = errors;
    throw err;
  }

  const data = {};
  for (const key of ["name", "description", "brief", "status"]) {
    if (value[key] !== undefined) data[key] = value[key];
  }
  if (body.settings !== undefined || body.kind !== undefined) {
    data.data = normalizeSettings({ ...(body.settings || {}), ...(body.kind ? { kind: body.kind } : {}) }, existing.data || {});
  }
  if (!Object.keys(data).length) return existing;

  return prisma.project.update({ where: { id: existing.id }, data });
}

export async function deleteProject(userId, id) {
  const existing = await getOwnedProject(userId, id);
  if (!existing) return false;
  // The FKs are all onDelete: SetNull — deleting a project releases its cast
  // and assets rather than destroying work that outlives it.
  await prisma.project.delete({ where: { id: existing.id } });
  return true;
}

// Everything that belongs to this project, for the detail view. Counts plus a
// first page each, in one round trip rather than five.
export async function getProjectContents(userId, id, { take = 24 } = {}) {
  const project = await getOwnedProject(userId, id);
  if (!project) return null;

  const [entities, assets, sessions, workflows, scenes] = await Promise.all([
    prisma.studioEntity.findMany({ where: { projectId: id, userId }, orderBy: { updatedAt: "desc" }, take }),
    prisma.asset.findMany({ where: { projectId: id, userId, isDeleted: false }, orderBy: { createdAt: "desc" }, take }),
    prisma.agentSession.findMany({ where: { projectId: id, userId }, orderBy: { updatedAt: "desc" }, take: 10 }),
    prisma.workflow.findMany({ where: { projectId: id, userId }, orderBy: { updatedAt: "desc" }, take: 10 }),
    listScenes(userId, id),
  ]);

  return {
    project,
    settings: normalizeSettings(project.data || {}),
    cast: entities.filter((e) => e.kind === "character"),
    products: entities.filter((e) => e.kind === "product"),
    environments: entities.filter((e) => e.kind === "environment"),
    assets,
    sessions,
    workflows,
    scenes,
  };
}

/* ── Scenes ──────────────────────────────────────────────────────────────
   A scene is a DirectorPipeline that carries this project's id. Director
   is not a separate place any more: it is the editor a scene opens into,
   and the pipeline row it already used is the scene record. Nothing is
   duplicated, and every pipeline built before projects existed keeps
   working — it simply has no project.

   The list is deliberately thin. A pipeline's `plan` holds every shot with
   its prompts and its results, and pulling that for a dozen scenes to draw
   a list of titles would move megabytes to render kilobytes.           */
// A shot's RESULT lives on its DirectorShot row, not on plan.shots — the
// plan is what was asked for, the row is what came back. Reading progress
// off the plan would report every scene as 0 rendered forever.
export function sceneSummary(pipeline, shotRows = []) {
  const planned = Array.isArray(pipeline?.plan?.shots) ? pipeline.plan.shots : [];
  const rendered = shotRows.filter((s) => shotVideoUrl(s)).length;
  const rowsById = new Map(shotRows.map((r) => [r.shotId || r.id, r]));
  const rowsByIndex = new Map(shotRows.map((r) => [r.index, r]));

  return {
    id: pipeline.id,
    title: pipeline.title,
    type: pipeline.type,
    status: pipeline.status,
    shots: planned.length || shotRows.length,
    rendered,
    assembledUrl: pipeline.assembledUrl || null,
    updatedAt: pipeline.updatedAt,
    // The sub-scenes. A scene is a list of shots, and hiding them behind a
    // count means the only way to see what a scene actually IS is to open
    // another surface. Kept thin — description, length, who is in it, and
    // what came back — because a scene list must not carry whole prompts.
    board: planned.map((shot, i) => {
      const row = rowsById.get(shot.id) || rowsByIndex.get(shot.index ?? i) || null;
      return {
        id: shot.id || `shot_${i}`,
        index: shot.index ?? i,
        title: shot.title || shot.imageStrategy?.prompt?.slice(0, 80) || `Shot ${i + 1}`,
        seconds: shot.durationSec || null,
        framing: shot.camera?.framing || null,
        subjects: Array.isArray(shot.subjects) ? shot.subjects : [],
        dialogue: shot.dialogue || null,
        status: row?.status || "draft",
        imageUrl: row?.imageResult?.url || row?.imageResult?.rawUrl || null,
        videoUrl: shotVideoUrl(row),
      };
    }),
  };
}

export const shotVideoUrl = (row) => row?.videoResult?.url || row?.videoResult?.rawUrl || null;

/* Scenes play in the order the screenplay puts them in, not the order their
   rows happened to be written.

   Creation time is a faithful stand-in for screenplay order exactly until
   you re-read a scene. Recreating scene 2 wrote a new row last, so the
   project listed it eleventh and the assembled cut PLAYED it eleventh — a
   silent re-edit of the film, from an operation that was supposed to change
   only that scene's shots.

   The number comes off the plan, and falls back to the numeric prefix the
   shot ids already carry ("s2_1" is scene 2), so scenes planned before this
   existed sort correctly without being rewritten. Anything with no number
   at all keeps its old position at the end rather than jumping the queue. */
export function screenplayNumber(pipeline) {
  const declared = Number(pipeline?.plan?.sceneNumber);
  if (Number.isFinite(declared) && declared > 0) return declared;
  const firstShot = pipeline?.plan?.shots?.[0]?.id;
  const m = /^s(\d+)_/.exec(String(firstShot || ""));
  return m ? Number(m[1]) : null;
}

export function orderByScreenplay(pipelines = []) {
  return [...pipelines]
    .map((p, i) => ({ p, i, n: screenplayNumber(p) }))
    .sort((a, b) => {
      if (a.n === null && b.n === null) return a.i - b.i;
      if (a.n === null) return 1;
      if (b.n === null) return -1;
      // A tie keeps the order they arrived in, so equal-numbered scenes
      // never shuffle between two reads of the same list.
      return a.n - b.n || a.i - b.i;
    })
    .map((x) => x.p);
}

export async function listScenes(userId, projectId) {
  if (!projectId) return [];
  const unordered = await prisma.directorPipeline.findMany({
    where: { projectId, userId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  if (!unordered.length) return [];
  const rows = orderByScreenplay(unordered);

  // One query for every scene's shots rather than one per scene.
  const shots = await prisma.directorShot.findMany({
    where: { pipelineId: { in: rows.map((r) => r.id) } },
    orderBy: { index: "asc" },
    select: { id: true, pipelineId: true, index: true, status: true, imageResult: true, videoResult: true },
  });
  const byPipeline = new Map();
  for (const s of shots) {
    if (!byPipeline.has(s.pipelineId)) byPipeline.set(s.pipelineId, []);
    byPipeline.get(s.pipelineId).push(s);
  }
  return rows.map((r) => sceneSummary(r, byPipeline.get(r.id) || []));
}

/* ── Combining scenes into one piece ─────────────────────────────────────
   Every scene already assembles its own shots. A project assembles its
   scenes, in the order they were added.

   A scene contributes its assembled cut when it has one; when it does not
   — because it was rendered shot by shot and never assembled — its shots
   stand in, in index order. Anything with no video at all is reported
   rather than silently skipped: a movie quietly missing scene 4 is worse
   than one that refuses to build and says which scene is empty.        */
export function movieClips(scenes, shotsByPipeline) {
  const clips = [];
  const missing = [];
  for (const scene of scenes) {
    if (scene.assembledUrl) { clips.push(scene.assembledUrl); continue; }
    const urls = (shotsByPipeline.get(scene.id) || []).map(shotVideoUrl).filter(Boolean);
    if (!urls.length) missing.push(scene.title || scene.id);
    else clips.push(...urls);
  }
  return { clips, missing };
}

export async function collectMovieClips(userId, projectId) {
  const scenes = await listScenes(userId, projectId);
  if (!scenes.length) return { clips: [], missing: [], scenes: [] };
  const shots = await prisma.directorShot.findMany({
    where: { pipelineId: { in: scenes.map((s) => s.id) } },
    orderBy: { index: "asc" },
    select: { pipelineId: true, index: true, videoResult: true },
  });
  const byPipeline = new Map();
  for (const s of shots) {
    if (!byPipeline.has(s.pipelineId)) byPipeline.set(s.pipelineId, []);
    byPipeline.get(s.pipelineId).push(s);
  }
  return { ...movieClips(scenes, byPipeline), scenes };
}

/* ── Reading the scenario ────────────────────────────────────────────────
   Breaking a screenplay down is a single LLM read of the whole script, and
   on a feature that runs for minutes. It was written as one long request
   and died at nginx's 300-second ceiling with the work half done — the
   client got an HTML error page, and nothing was saved.

   So the state lives on the project and the client polls it. A read that
   stops being touched is reported as stalled rather than left spinning
   forever, because a process restart mid-read is a real thing that
   happens and "still reading…" after an hour is a lie.                  */
const READ_STALE_MS = 25 * 60 * 1000;

export function breakdownState(project) {
  const raw = project?.data?.breakdown;
  if (!raw || typeof raw !== "object") return { status: "idle" };
  if (raw.status === "reading") {
    const started = Date.parse(raw.startedAt || "");
    if (Number.isFinite(started) && Date.now() - started > READ_STALE_MS) {
      return { ...raw, status: "stalled", error: "The read stopped partway through. Start it again." };
    }
  }
  return raw;
}

export async function setBreakdownState(projectId, state) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { data: true } });
  if (!project) return null;
  return prisma.project.update({
    where: { id: projectId },
    data: { data: { ...(project.data || {}), breakdown: state } },
  });
}

// The finished piece is recorded on the project itself so it survives a
// reload and can be handed to anyone. Written straight rather than through
// updateProject, whose payload validation has no business knowing about it.
export async function setProjectMovie(userId, projectId, url, meta = {}) {
  const project = await getOwnedProject(userId, projectId);
  if (!project) return null;
  const data = {
    ...normalizeSettings(project.data || {}),
    movieUrl: url,
    movieBuiltAt: new Date().toISOString(),
    movieMeta: meta,
  };
  return prisma.project.update({ where: { id: project.id }, data: { data } });
}

// The planner owns pipeline creation (it validates shots and prices the
// plan). Filing it under the project is a second step, done here so the
// planner keeps knowing nothing about projects.
export async function attachScene(userId, projectId, pipelineId) {
  const project = await getOwnedProject(userId, projectId);
  if (!project) return null;
  const { count } = await prisma.directorPipeline.updateMany({
    where: { id: pipelineId, userId },
    data: { projectId },
  });
  return count > 0;
}
