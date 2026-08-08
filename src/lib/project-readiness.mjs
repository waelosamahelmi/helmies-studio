// Will this render well? — asked BEFORE the money moves (P1.9).
//
// Every way TWO LIVES came out wrong was knowable in advance and nothing
// said it: a room with one photograph, a phone nobody tracked, a scene
// whose shots were never linked, a video model that cannot be shown a
// face. Each cost a render to discover.
//
// So a project answers for itself. These are not opinions — each check
// maps to a specific, observed failure, and says what it will look like
// rather than just naming a field. A warning nobody understands is a
// warning nobody acts on.
//
// Pure and worker-safe: hand it the project's contents, get back findings.
// The UI shows them and the render path can refuse on the fatal ones.
import { packFor, missingPackAngles } from "./entity-core.mjs";

export const SEVERITY = { BLOCKS: "blocks", DRIFTS: "drifts", NOTE: "note" };

/* A face is never invented, so a character with no photograph cannot be
   rendered as that person at all — that one BLOCKS. A place or a prop with
   no coverage still renders; it just renders differently each time, which
   is a drift, not a stop. */
function castFindings(members = []) {
  const out = [];
  for (const e of members) {
    const refs = Array.isArray(e.references) ? e.references : [];
    const own = refs.filter((r) => r.source !== "generated" && r.kind !== "voice");
    const missing = missingPackAngles(e);
    const total = packFor(e.kind).length;

    if (e.kind === "character" && own.length === 0) {
      out.push({
        severity: SEVERITY.BLOCKS,
        subject: e.name,
        problem: "no photograph",
        looksLike: `Every shot with ${e.name} renders a stranger, and a different stranger each time.`,
        fix: `Add one photograph of ${e.name} in Cast — every angle is generated from it.`,
      });
      continue;
    }
    if (missing.length === total) {
      out.push({
        severity: SEVERITY.DRIFTS,
        subject: e.name,
        problem: "nothing on file",
        looksLike: e.kind === "environment"
          ? `${e.name} is re-invented in every shot — different window, different furniture.`
          : `${e.name} changes shape between cuts.`,
        fix: e.kind === "character"
          ? "Generate the angles in Cast."
          : `Draw the first view from the description, then the rest from it.`,
      });
    } else if (missing.length) {
      out.push({
        severity: SEVERITY.DRIFTS,
        subject: e.name,
        problem: `${total - missing.length} of ${total} views`,
        looksLike: e.kind === "environment"
          ? `${e.name} holds until the camera turns, then invents what it has not been shown.`
          : `${e.name} is consistent from the angles on file and guessed from the rest.`,
        fix: `Generate the missing ${missing.map((m) => m.label.toLowerCase()).join(", ")}.`,
      });
    }
  }
  return out;
}

/* The format and the models. A project with no video model renders on a
   default nobody chose — which is how a $1.28 model came to be picked by
   accident. */
function settingsFindings(settings = {}) {
  const out = [];
  if (!settings.videoModel) {
    out.push({
      severity: SEVERITY.NOTE,
      subject: "Video model",
      problem: "not chosen",
      looksLike: "Clips render on a default nobody picked, which may not be the one you want to pay for.",
      fix: "Choose one under Scenario & format.",
    });
  }
  if (!settings.imageModel) {
    out.push({
      severity: SEVERITY.NOTE,
      subject: "Image model",
      problem: "not chosen",
      looksLike: "Stills render on a default nobody picked.",
      fix: "Choose one under Scenario & format.",
    });
  }
  return out;
}

/* The scenes themselves. Continuity is the difference between a sequence
   and four unrelated clips, and it is set by the breakdown — a hand-added
   scene has none. */
function sceneFindings(scenes = []) {
  const out = [];
  if (!scenes.length) return out;

  const unplanned = scenes.filter((s) => !s.shots);
  if (unplanned.length) {
    out.push({
      severity: SEVERITY.BLOCKS,
      subject: `${unplanned.length} scene${unplanned.length === 1 ? "" : "s"}`,
      problem: "no shots",
      looksLike: "Nothing to render — the scene exists but was never broken into shots.",
      fix: "Break the scenario down, or plan the scene from its description.",
    });
  }
  return out;
}

/**
 * Everything worth knowing before spending, worst first.
 *
 * @param contents  what /api/projects/[id] returns
 * @returns { findings, blocks, drifts, ready }
 */
export function projectReadiness(contents = {}) {
  const members = [...(contents.cast || []), ...(contents.environments || []), ...(contents.products || [])];
  const findings = [
    ...castFindings(members),
    ...sceneFindings(contents.scenes || []),
    ...settingsFindings(contents.settings || {}),
  ];

  const order = { [SEVERITY.BLOCKS]: 0, [SEVERITY.DRIFTS]: 1, [SEVERITY.NOTE]: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  const blocks = findings.filter((f) => f.severity === SEVERITY.BLOCKS);
  const drifts = findings.filter((f) => f.severity === SEVERITY.DRIFTS);

  return {
    findings,
    blocks,
    drifts,
    // "Ready" means nothing here will render something that is simply not
    // the thing you asked for. Drifts are still allowed through — they are
    // a quality judgement, and it is not this function's place to refuse
    // somebody their own money.
    ready: blocks.length === 0,
  };
}

/** One line, for a scene row or a header. */
export function readinessSummary(readiness) {
  if (!readiness) return null;
  if (readiness.blocks.length) {
    return `${readiness.blocks.length} thing${readiness.blocks.length === 1 ? "" : "s"} will render wrong`;
  }
  if (readiness.drifts.length) {
    return `${readiness.drifts.length} thing${readiness.drifts.length === 1 ? "" : "s"} will drift between shots`;
  }
  return null;
}
