// Helmies Studio — the agent building a real production.
//
// The agent has always planned FLAT: a storyboard, some stills, some clips
// chained off each other's last frames. That is a good shape for a
// commercial — a handful of shots, no dialogue, nothing that has to be the
// same person in scene nine as in scene two.
//
// It is the wrong shape for a film, and it was the only shape available. A
// film has scenes, and a scene has people who speak, and everything that
// makes that survive thirty shots — the duration floor the provider
// actually enforces, one voice per shot chosen by who is speaking, wardrobe
// that distinguishes two characters who share a face, off-screen lines that
// stay off-screen, scenes ordered by the screenplay rather than by when
// they happened to be created — lives in the PROJECT pipeline, and the
// agent could not reach any of it. Every one of those was a bug found by
// rendering a film and watching it come out wrong.
//
// So: a `production` step. The agent writes the screenplay itself, this
// creates the project, files the cast against it, and runs the same
// two-pass breakdown the Projects board runs. What comes out is a real
// production with a real shot list, sitting where the render controls are.
//
// IT DOES NOT RENDER, and that is a decision rather than an omission.
// Rendering a film is a second, much larger sum of money whose size is not
// knowable until the breakdown exists — you cannot quote a shot list you
// have not read yet. An agent run reserves its whole cost up front, so
// rendering inside one would mean either reserving a number nobody can
// compute or spending outside the reservation the user approved. Both are
// worse than handing back a finished shot list and a price.
import prisma from "./prisma.js";
import { createProject, listScenes, normalizeSettings } from "./projects.js";
import { runBreakdown } from "./screenplay-breakdown.js";
import { estimateProjectCost } from "./project-models.mjs";
import { log } from "./log.js";

const MIN_SCREENPLAY = 120;

const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Build a production from a screenplay the agent wrote.
 *
 * params:
 *   screenplay   the script itself — scene headings, action, dialogue
 *   title        what to call the project
 *   kind         "movie" | "ad" | "music-video" | …  (project kind)
 *   aspectRatio, resolution, videoModel, imageModel, voiceModel
 *   entityIds    cast already on file that appears in it
 */
export async function runProductionStep(params = {}, { userId } = {}) {
  if (!userId) throw new Error("A production has to belong to somebody.");

  const screenplay = clean(params.screenplay || params.script || params.brief, 200000);
  if (screenplay.length < MIN_SCREENPLAY) {
    /* A one-line "make a film about a man in a room" is not a screenplay,
       and reading it produces a shot list that is entirely invention. The
       planner contract says to write the script out in full; this is what
       makes that non-optional. */
    throw new Error(
      "A production step needs the actual screenplay — scene headings, action and dialogue written out in full, not a description of the film.",
    );
  }

  const settings = normalizeSettings({
    kind: params.kind || "movie",
    ...(params.aspectRatio ? { aspectRatio: params.aspectRatio } : {}),
    ...(params.resolution ? { resolution: params.resolution } : {}),
    ...(params.videoModel ? { videoModel: params.videoModel } : {}),
    ...(params.imageModel ? { imageModel: params.imageModel } : {}),
    ...(params.voiceModel ? { voiceModel: params.voiceModel } : {}),
  });

  const project = await createProject(userId, {
    name: clean(params.title, 120) || "Untitled production",
    description: clean(params.logline || params.description, 400) || null,
    brief: screenplay,
    settings,
  });

  /* Cast the agent named comes ALONG to the project.
     A character filed against no project is invisible to the breakdown's
     entity matching, so the read would create a second one from the same
     name and the real reference photographs would never be attached. */
  const wanted = Array.isArray(params.entityIds) ? params.entityIds.filter((v) => typeof v === "string" && v).slice(0, 24) : [];
  if (wanted.length) {
    await prisma.studioEntity.updateMany({
      where: { id: { in: wanted }, userId, projectId: null },
      data: { projectId: project.id },
    }).catch((err) => log.info("production_cast_attach_failed", { projectId: project.id, error: err?.message }));
  }

  /* The same two-pass read the Projects board runs — structure first, then
     one pass per scene, sixteen scenes at a time. Awaited here rather than
     detached: an agent step that returned before its work existed would
     report a production with no scenes in it, and the next step would plan
     against nothing. */
  await runBreakdown({
    projectId: project.id,
    userId,
    script: screenplay,
    settings,
    replace: true,
  });

  const scenes = await listScenes(userId, project.id);
  const shots = scenes.reduce((n, s) => n + (s.shots || 0), 0);
  const seconds = scenes.reduce((n, s) => n + (s.seconds || 0), 0);

  if (!scenes.length) {
    throw new Error("The screenplay was read but produced no scenes. Check that it is written as a screenplay and try again.");
  }

  const cost = estimateProjectCost(scenes, {
    imageCredits: Number(params.imageCredits) || 0,
    videoCredits: Number(params.videoCredits) || 0,
  });

  return {
    projectId: project.id,
    name: project.name,
    scenes: scenes.length,
    shots,
    seconds,
    url: `/studio/projects?project=${project.id}`,
    estimate: cost,
    /* Said plainly, because the plan card shows this verbatim and the
       difference between "your film is made" and "your film is ready to
       shoot" is several hundred credits. */
    summary: `${project.name}: ${scenes.length} scene${scenes.length === 1 ? "" : "s"}, ${shots} shot${shots === 1 ? "" : "s"}, about ${Math.round(seconds)}s. Nothing has been rendered yet — open the project to review the shots and shoot it.`,
  };
}
