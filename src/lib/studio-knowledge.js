// Helmies Studio — what the agent knows about the studio it lives in.
//
// Before this, every fact the agent had about its own capabilities was a
// sentence somebody had typed into a system prompt by hand: a short list of
// six cheap models, an example plan, and nothing at all about the other
// hundred and twenty rows in the catalog, the constraints that make a render
// fail, or the tools sitting next to it in the app. So it planned as if the
// studio were the fragment of it that had been described, and every new
// capability had to be taught by editing a prompt.
//
// This builds that knowledge from the ONLY sources that cannot go stale: the
// live model catalog, and the step kinds the executors actually implement.
// Add a model to the catalog and the agent knows about it on the next turn.
//
// It is a DIGEST, not a dump. 134 models pasted into a prompt is 134 chances
// to pick the wrong one; grouped by what a model is FOR, with the price and
// the limits that decide a choice, is something a planner can act on.
import prisma from "./prisma.js";
import { shotDurationLimits } from "./project-models.mjs";

/* The steps that cost no model at all.
   ────────────────────────────────────────────────────────────────────────
   Deliberately a local copy rather than an import of pricing-engine.js's
   NON_PROVIDER_STEP_CREDITS. That module reaches for "@/lib/..." aliases,
   which exist only inside the Next bundle: importing it here would make
   this file unloadable under plain node and quietly bar the digest from
   ever being used anywhere near the worker. The copy is kept honest by
   tests/unit/studio-knowledge.test.mjs, which fails if the two disagree. */
const FREE_STEPS = { assembly: 5, export: 0, storyboard: 0, title: 1, production: 0 };


/* Catalogue reads are the same for every user and change when a sync runs,
   not between turns. A minute of cache turns three database round-trips per
   chat message into roughly none, which matters most in a live call where
   the user is waiting with a microphone open. */
const TTL_MS = 60_000;
let cache = { at: 0, text: "" };

const money = (n) => (Number.isFinite(n) ? `${n} cr` : "?");

/* What a model is FOR, from the fields it takes rather than the label
   somebody typed. The catalog's own `capability` column is close but not
   trustworthy — it is what put a text-to-video row in an image picker — so
   the grouping here is checked against the schema. */
function groupOf(row) {
  const id = String(row.modelId || "");
  const cap = String(row.capability || "");
  if (/upscale/i.test(cap + id)) return "upscale";
  if (/background-removal/i.test(cap)) return "utility";
  if (/avatar|lip-?sync|omnihuman|infinitalk/i.test(cap + id)) return "avatar";
  if (/recast|motion-control|animate/i.test(cap + id)) return "recast";
  if (/text-to-speech|tts/i.test(cap + id)) return "speech";
  if (cap === "audio" || /suno|music|lyric|vocal|sound/i.test(id)) return "audio";
  if (/reference-to-video/i.test(cap)) return "reference-video";
  if (/video-to-video/i.test(cap)) return "video-edit";
  if (/image-to-video/i.test(cap)) return "image-to-video";
  if (/text-to-video/i.test(cap) || cap === "video") return "text-to-video";
  if (/image-to-image/i.test(cap)) return "image-edit";
  if (/text-to-image/i.test(cap) || cap === "image") return "image";
  return "other";
}

/* The constraints that actually decide a plan, read off the schema rather
   than remembered. Duration limits are the ones that cost real money when
   they are wrong — a shot under a model's floor is a 422 and a dead render,
   which is exactly what happened at two seconds against Seedance's four. */
function limitsOf(row) {
  const bits = [];
  const schema = row.inputSchema;
  const fields = schema?.fields || {};
  if (fields.duration) {
    const { min, max } = shotDurationLimits({ schema });
    bits.push(`${min}-${max}s`);
  }
  if (fields.reference_audio_urls || fields.reference_audio_url) bits.push("voice-clone");
  if (fields.aspect_ratio?.enum?.length) bits.push(fields.aspect_ratio.enum.join("/"));
  const refs = Object.keys(fields).filter((f) => /image|reference/i.test(f));
  if (refs.length && !/^image$/.test(groupOf(row))) bits.push(`refs:${refs.length}`);
  return bits.length ? ` (${bits.join(", ")})` : "";
}

const GROUP_TITLES = {
  image: "Still images (text to image)",
  "image-edit": "Image editing / image to image",
  "text-to-video": "Video from a prompt alone",
  "image-to-video": "Video from an approved still — THE MAIN PATH",
  "reference-video": "Video from reference images of a person or product",
  "video-edit": "Editing or extending an existing clip",
  avatar: "Talking heads and lip-sync",
  recast: "Motion transfer / replacing a subject in existing footage",
  audio: "Music, lyrics, vocals and sound effects",
  speech: "Spoken voice (text to speech)",
  upscale: "Upscaling",
  utility: "Utilities",
};

const GROUP_ORDER = [
  "image-to-video", "text-to-video", "reference-video", "image", "image-edit",
  "audio", "speech", "avatar", "video-edit", "recast", "upscale", "utility",
];

/**
 * Everything the studio can actually do, as prompt text.
 *
 * Shaped for a reader who has to CHOOSE: cheapest first inside each group,
 * because that is the order somebody picks in, and with the limits attached
 * to the row rather than in a footnote.
 */
export async function studioCapabilities() {
  if (cache.text && Date.now() - cache.at < TTL_MS) return cache.text;

  let rows = [];
  try {
    rows = await prisma.modelPricing.findMany({
      where: { isActive: true, isDeprecated: false },
      select: { modelId: true, displayName: true, capability: true, creditsCost: true, inputSchema: true },
      orderBy: { creditsCost: "asc" },
    });
  } catch {
    // The agent must still work when the catalog is unreachable; it simply
    // plans with the runnable-model hint alone, as it always did.
    return "";
  }
  if (!rows.length) return "";

  const groups = new Map();
  for (const row of rows) {
    const g = groupOf(row);
    if (g === "other") continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(row);
  }

  const lines = [
    "",
    "",
    "══ WHAT THIS STUDIO CAN DO ══",
    `Every model below is live in the catalog right now (${rows.length} of them) and can be named on a step. Prices are in credits per generation. Cheapest first in each group — cheap is usually right for a reference nobody will look at twice, and wrong for the hero shot.`,
    "",
  ];

  for (const g of GROUP_ORDER) {
    const list = groups.get(g);
    if (!list?.length) continue;
    const shown = list.slice(0, 10);
    lines.push(`${GROUP_TITLES[g] || g}:`);
    for (const row of shown) lines.push(`  ${row.modelId} — ${money(row.creditsCost)}${limitsOf(row)}`);
    if (list.length > shown.length) lines.push(`  …and ${list.length - shown.length} more of this kind.`);
    lines.push("");
  }

  lines.push(
    "HOW TO CHOOSE, in one rule each:",
    "- A production's shots go STILL FIRST, then animate it. A wrong face then costs an image instead of a video, and the still is the thing a person can approve.",
    "- A model that takes reference images is the only way a real person's face survives thirty shots. Name their entity id in params.entityIds; do not describe them in the prompt as well.",
    "- A model listing voice-clone takes a reference recording, which is what makes a character speak or sing in their own voice. One voice per shot: the voice of whoever speaks in it.",
    "- Duration is a CEILING, not a target. A beat that lands in two seconds should not be given eight — but never go below the model's floor, which is a hard provider rejection, not a preference.",
    "- Words the viewer must read are a `title` step, never a prompt.",
    "",
    "STEPS THAT COST NO MODEL AT ALL:",
    ...Object.entries(FREE_STEPS).map(([kind, credits]) => `  ${kind} — ${credits} cr (runs locally with ffmpeg or the LLM; no provider involved)`),
    "",
    "THE REST OF THE STUDIO — tools the user can also open by hand, so do not offer to rebuild them:",
    "  Projects — a production's spine: format, cast, scenes, the screenplay, render and combine.",
    "  Characters — identities with reference photographs and generated angle packs; the faces you name in entityIds.",
    "  Brand kit — logo, palette, typefaces, tone. The logo is a real file, never generated.",
    "  Voice profiles and voice cloning — the recordings that make a clip sound like somebody.",
    "  Canvas, Video edit, Assets, Workflows, Templates — manual surfaces for work already generated.",
  );

  cache = { at: Date.now(), text: lines.join("\n") };
  return cache.text;
}

/** Drop the cache — used by the catalog sync so a new model is visible at once. */
export function forgetStudioCapabilities() {
  cache = { at: 0, text: "" };
}
