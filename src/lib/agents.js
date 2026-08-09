import { llmComplete, llmStream, resolveProvider, brandForUser } from "@/lib/providers";
import { estimateCredits, estimateAgentTask } from "@/lib/pricing-engine";
import { appendMessage } from "@/lib/agent-sessions";
import {
  generateImage, generateI2I, generateVideo, generateI2V,
  processLipSync, generateAudio, processRecast,
  runClipping, runMotionGraphics, generateMarketingAd,
} from "@/lib/generation";
import { detectAbuse } from "@/lib/security";
import { getWallet, debitWallet, refundCredits } from "@/lib/wallet";
import { assembleVideos } from "@/lib/video-assembly";
import { renderTitleCard, overlayTitles } from "@/lib/title-render";
import { titleLines, titleDuration } from "@/lib/title-step.mjs";
import { renderFinalCut } from "@/lib/final-cut";
import { runProductionStep } from "@/lib/production-step";
import { resolveRunnableModel, getRunnableModelsForType } from "@/lib/model-catalog";
import { runnableProviderModelId, audioKind, requiresMediaInput } from "@/lib/model-catalog-core.mjs";
import {
  defaultRunnableModelForKind,
  pickSubstituteModel as pickSharedSubstituteModel,
  getFallbackCandidates,
} from "@/lib/runnable-models";
import { AGENTS, TOOL_AGENT_KEYS, GENERIC_PERSONA_PROMPT } from "@/lib/agent-registry.mjs";
import { isVoiceoverInstruction } from "@/lib/voiceover-guard";
import { chainStepIfNeeded } from "@/lib/video-chain";
import { log } from "@/lib/log";
import { studioCapabilities } from "@/lib/studio-knowledge";
import prisma from "@/lib/prisma";

// Agent registry lives in src/lib/agent-registry.mjs (shared with the durable
// agent-runner); imported above. getAgent/getAgentList below read that same map.

export function getAgent(type) {
  return AGENTS[type] || AGENTS.orchestrator;
}

export function getAgentList() {
  return Object.entries(AGENTS).map(([id, a]) => ({ id, name: a.name, description: a.description }));
}

const slugify = (s) => s.trim().toLowerCase().replace(/[\s-]+/g, "_");

// The orchestrator LLM sometimes emits a registry key ("creative_director"),
// sometimes the human-readable display name ("Creative Director"), and
// occasionally hyphenated or oddly-cased variants. Normalize whatever comes
// in to the canonical AGENTS key so dispatch never depends on the model's
// exact casing/spacing choice.
export function normalizeAgentKey(agent) {
  if (!agent || typeof agent !== "string") return "";
  const slug = slugify(agent);
  if (AGENTS[slug]) return slug;
  const byName = Object.entries(AGENTS).find(([, def]) => slugify(def.name) === slug);
  return byName ? byName[0] : slug;
}

// ── Live runnable-model hint for the planner LLM (URGENT production fix) ──
// AGENTS.orchestrator.systemPrompt's own JSON example used to hardcode
// "flux-dev"/"kling-v2.1-i2v" as illustrative model ids — both are
// isDeprecated in production, and the planner LLM took the hint literally,
// which is how the exact production incident this fix targets happened
// (`{ agent: "image", params: { model: "flux-dev" } }`). A module-level
// string constant can never track a live catalog, so instead of hardcoding
// BETTER examples (which would just go stale the same way, eventually),
// this fetches a short, live snapshot of currently-runnable ids per
// capability and appends it to the system prompt on every planning call —
// the prompt (above) tells the model to pick ONLY from this list.
async function runnableModelHint(context) {
  try {
    const [images, videos, audioRows] = await Promise.all([
      getRunnableModelsForType("image", { limit: 6 }),
      getRunnableModelsForType("video", { limit: 6 }),
      // A wide audio slice, split by audioKind below: "music" steps need a
      // genuine composer and "voiceover" steps a genuine TTS reader — the
      // SAME honest sub-classification the studios and defaultRunnableModel
      // already gate their pools on. A flat cheapest-6 audio list buried the
      // composers under transform utilities and gave the planner nothing it
      // could safely put on a music or voiceover step.
      getRunnableModelsForType("audio", { limit: 50 }),
    ]);
    const musicRows = audioRows.filter((row) => audioKind(row) === "music").slice(0, 6);
    const ttsRows = audioRows.filter((row) => {
      const kind = audioKind(row);
      return kind === "tts" || kind === "dialogue";
    }).slice(0, 6);
    const line = (label, rows) => {
      const ids = rows.map(runnableProviderModelId).filter(Boolean);
      return ids.length ? `- ${label}: ${ids.join(", ")}` : null;
    };
    const lines = [
      line("image", images),
      line("video", videos),
      line("music", musicRows),
      line("voiceover", ttsRows),
    ].filter(Boolean);
    // A user who names a model in chat must be hearable: the hard "use ONLY
    // an exact id from this list" rule structurally forbade honoring a model
    // outside the 6-cheapest slice (measured incident: "use seedance 2" was
    // ignored twice). Their models are appended here as explicit user-
    // requested entries, AND pinned deterministically after parsing — see
    // resolveUserRequestedModels/pinUserRequestedModels below.
    const requested = await resolveUserRequestedModels(context);
    if (requested.length) {
      const byKind = new Map();
      for (const r of requested) {
        const list = byKind.get(r.kind) || [];
        list.push(r.row);
        byKind.set(r.kind, list);
      }
      for (const [kind, rows] of byKind) {
        const ids = [...new Set(rows.map(runnableProviderModelId).filter(Boolean))];
        if (ids.length) lines.push(`- user-requested ${kind} (the user named this model — honor it): ${ids.join(", ")}`);
      }
    }
    if (!lines.length) return "";
    return `\n\nCurrently runnable models — use ONLY an exact id from this list in a step's "model" param:\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

// ── User-requested model resolution (2026-08-06, A9 follow-up) ─────────────
// Production incident: the user asked twice for "seedance 2" in the chat and
// the plan used kling-3.0/motion-control both times. The planner's hard rule
// is "use ONLY an exact id from the hint list", and the hint list is the 6
// CHEAPEST runnable rows per kind — a user-named model outside that slice
// (bytedance/seedance-2 is 143 cr against an 8 cr cheapest) was
// structurally impossible for the LLM to pick. resolveUserRequestedModels
// scans the conversation for vendor+version mentions and resolves each
// against the LIVE runnable pools (the SAME gated getRunnableModelsForType
// the hint and fallback chains use — the video gate is what makes "kling
// 3.0" resolve to kling-3.0/video rather than the media-required
// motion-control variant), and pinUserRequestedModels writes an
// unambiguous resolution onto every matching-kind step after the plan is
// parsed. The re-quote then shows the user the REAL cost (143 cr) before
// approval, so an explicit choice is honored end-to-end, not just
// suggested.
const normModelToken = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9.]+/g, "").replace(/\.0+$/g, "");
const MODEL_MENTION_RE = /([a-z][a-z0-9.\-]*?)(?:\s*(?:v\.?)?(\d+(?:\.\d+)*))/gi;

// Rank a mention against a row: exact id match 2; id/display STARTS or ENDS
// with the mention 1 (vendor prefixes and capability suffixes surround the
// named part); only-contains 0 (too loose to pin — e.g. "seedance 2"
// contains-matches the -fast variant too). Returns the top-ranked rows.
// Exported for unit tests (same rationale as defaultRunnableModel).
// "@Wael" resolves against the cast before it is ever treated as a model
// name. Returns the entity ids a message names, so the plan can carry them.
export async function resolveMentionedEntities(userId, text) {
  if (!userId || typeof text !== "string" || !text.includes("@")) return [];
  const fragments = [...text.matchAll(/@([\p{L}\p{N}_-]{2,40})/gu)].map((m) => m[1].toLowerCase());
  if (!fragments.length) return [];
  try {
    const rows = await prisma.studioEntity.findMany({
      where: { userId },
      select: { id: true, name: true, kind: true },
      take: 100,
    });
    const hits = [];
    for (const row of rows) {
      const name = String(row.name || "").toLowerCase().replace(/\s+/g, "");
      if (!name) continue;
      if (fragments.some((f) => f === name || name.startsWith(f) || f.startsWith(name))) hits.push(row);
    }
    return hits;
  } catch {
    return [];
  }
}

export async function resolveMentionRows(fragment, rows) {
  const f = normModelToken(fragment);
  if (f.length < 5) return [];
  let bestRank = -1;
  const hits = [];
  for (const row of rows) {
    let rank = -1;
    for (const candidate of [normModelToken(row.modelId), normModelToken(row.displayName)]) {
      if (!candidate) continue;
      if (candidate === f) rank = 2;
      else if (candidate.endsWith(f) || candidate.startsWith(f)) rank = Math.max(rank, 1);
      else if (candidate.includes(f)) rank = Math.max(rank, 0);
    }
    if (rank >= 0) { hits.push({ row, rank }); bestRank = Math.max(bestRank, rank); }
  }
  return hits.filter((h) => h.rank === bestRank && h.rank >= 1);
}

// Exported for unit tests — see resolveMentionRows for why.
export async function resolveUserRequestedModels(context) {
  const text = [
    ...(Array.isArray(context?.conversation)
      ? context.conversation.map((m) => (typeof m?.content === "string" ? m.content : ""))
      : []),
    typeof context?.userMessage === "string" ? context.userMessage : "",
  ].join("\n");
  const fragments = [...text.matchAll(MODEL_MENTION_RE)].map((m) => m[0].trim());
  if (!fragments.length) return [];

  const pools = {
    video: () => getRunnableModelsForType("video", { limit: 500 }).catch(() => []),
    image: () => getRunnableModelsForType("image", { limit: 500 }).catch(() => []),
    music: () => getRunnableModelsForType("audio", { limit: 500 }).catch(() => []).then((rows) => rows.filter((row) => audioKind(row) === "music")),
    voiceover: () => getRunnableModelsForType("audio", { limit: 500 }).catch(() => []).then((rows) => rows.filter((row) => { const k = audioKind(row); return k === "tts" || k === "dialogue"; })),
  };
  const seen = new Set();
  const kindRows = {};
  const kindFrags = {}; // the fragments that resolved into each kind (for the exact-tail tiebreak below)
  for (const [kind, load] of Object.entries(pools)) {
    const rows = await load();
    for (const fragment of fragments) {
      const hits = await resolveMentionRows(fragment, rows);
      if (!hits.length) continue;
      (kindFrags[kind] || (kindFrags[kind] = [])).push(fragment);
      for (const hit of hits) {
        const key = `${kind}:${hit.row.modelId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        (kindRows[kind] || (kindRows[kind] = [])).push(hit.row);
      }
    }
  }
  // A kind with several DIFFERENT rows resolved is ambiguous — the planner
  // still sees them in the hint list, but nothing gets pinned.
  const out = [];
  for (const [kind, rows] of Object.entries(kindRows)) {
    const unique = [...new Map(rows.map((r) => [r.modelId, r])).values()];
    if (unique.length === 1) {
      out.push({ kind, row: unique[0] });
      continue;
    }
    // Ambiguous PREFIX hits can still have a single EXACT id-tail match —
    // "Seedance 2.0" prefix-matches both bytedance/seedance-2 and
    // bytedance/seedance-1.5-pro, but only bytedance/seedance-2 is an exact
    // id-tail match (bare "seedance-2" normalizes to "seedance2"). Prefer
    // the exact one so the pin and the chat's authoritative resolution
    // agree (2026-08-06: the chat said seedance-1.5-pro while the pin
    // silently used seedance-2 — the user was told 8 cr and charged 143).
    const frag = (kindFrags[kind] || [])[0];
    const exact = frag ? unique.filter((r) => {
      const bare = String(runnableProviderModelId(r) || "").toLowerCase().replace(/^.*\//, "");
      return bare === normModelToken(frag);
    }) : [];
    if (exact.length === 1) out.push({ kind, row: exact[0] });
  }
  return out;
}

// Deterministic backstop to the LLM honoring the hint: an unambiguous
// user-requested model is written onto every step of its kind. The caller
// re-runs estimateAgentTask AFTER this so the approval shows the real cost.
// Exported for unit tests — see resolveMentionRows for why.
export function pinUserRequestedModels(plan, requested) {
  if (!Array.isArray(plan?.steps) || !requested.length) return plan;
  let pinned = 0;
  for (const { kind, row } of requested) {
    const modelId = runnableProviderModelId(row);
    if (!modelId) continue;
    for (const step of plan.steps) {
      if (normalizeAgentKey(step.agent) !== kind) continue;
      const params = step.params || {};
      if (params.model === modelId) continue;
      step.params = { ...params, model: modelId, endpoint: modelId };
      pinned++;
    }
  }
  if (pinned) {
    const names = [...new Set(requested.map(({ row }) => runnableProviderModelId(row)).filter(Boolean))].join(", ");
    plan.summary = `${plan.summary || ""} [Models pinned to your request: ${names}]`.trim();
  }
  return plan;
}

// ── Session defaults for the planner (A9 task 5) ──────────────────────────
// When the session has stored model/quality preferences (E3 settings), the
// planner is told about them as soft defaults — the plan route loads them
// off the session row and passes them in `context.settings`.
function sessionDefaultsHint(context) {
  const s = context?.settings;
  if (!s || typeof s !== "object") return "";
  const parts = [];
  if (typeof s.imageModel === "string" && s.imageModel) parts.push(`image model ${s.imageModel}`);
  if (typeof s.videoModel === "string" && s.videoModel) parts.push(`video model ${s.videoModel}`);
  if (typeof s.audioModel === "string" && s.audioModel) parts.push(`audio model ${s.audioModel}`);
  if (typeof s.quality === "string" && s.quality) parts.push(`quality ${s.quality}`);
  if (typeof s.aspect === "string" && s.aspect) parts.push(`aspect ratio ${s.aspect}`);
  if (!parts.length) return "";
  return `\n\nSession defaults (use unless the brief demands otherwise): ${parts.join("; ")}.`;
}

// The planner's user turn: any extra context, the FULL conversation when the
// caller supplies one (A9 — "ok" in chat must be enough; nothing should ever
// need re-pasting into the brief box), then the request itself.
function buildPlanUserContent(userMessage, context = {}) {
  const { conversation, settings, ...rest } = context || {};
  const parts = [];
  if (rest && Object.keys(rest).length) parts.push(`Context: ${JSON.stringify(rest)}`);
  if (Array.isArray(conversation) && conversation.length) {
    const transcript = conversation
      .filter((m) => m && typeof m.content === "string" && m.content.trim())
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.trim()}`)
      .join("\n");
    // Newest-tail cap so a very long chat can't blow the context window —
    // the distilled brief travels in `userMessage` regardless.
    parts.push(`Conversation so far — plan the COMPLETE production agreed here:\n${transcript.slice(-8000)}`);
  }
  parts.push(`Request: ${userMessage}`);
  return parts.join("\n\n");
}

// The LLM is asked for raw JSON but sometimes wraps it in markdown fences or
// commentary — strip fences, then take the outermost {...} span (the same
// tolerance director-planner.js's extractJsonObject already applies).
export function extractPlanJson(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

const STRICT_JSON_RETRY_HINT =
  "Your previous reply was not a valid plan. Reply with ONLY one valid JSON object matching the required plan schema — no markdown fences, no commentary before or after it.";

// A complete plan with real narration scripts is LONG — the old 2000-token
// cap truncated exactly the plans the new contract demands, the JSON parse
// failed on the truncated tail, and the failure degraded SILENTLY to the
// heuristic (production incident: a 7-turn launch-film brief came back as
// "Heuristic plan: 1 step(s)" with one audio step and no log anywhere).
const PLAN_MAX_TOKENS = 8000;

async function llmPlanOnce(messages) {
  const response = await llmComplete(messages, { maxTokens: PLAN_MAX_TOKENS, temperature: 0.3 });
  const jsonText = extractPlanJson(response);
  if (!jsonText) throw new Error("planner reply contained no JSON object");
  const json = JSON.parse(jsonText);
  if (!Array.isArray(json.steps) || !json.steps.length) throw new Error("planner reply had no steps");
  return json;
}

// One LLM planning request with ONE strict-JSON retry (mirroring
// director-planner.js's generateLlmPlan) and LOUD failure logging — a
// planner degradation must never again be invisible in production logs.
// Returns the parsed plan JSON, or null when both attempts failed (the
// caller then falls back to the heuristic and MARKS the plan as degraded).
// C1.9 — the cast the user has already defined. A character here carries
// reference photographs of a real face; naming its id on a step is what makes
// that face come out, so the planner has to know the ids exist. Without this
// it invented descriptions and every shot rendered a different stranger.
async function castHint(context = {}) {
  const userId = context?.userId;
  if (!userId) return "";
  try {
    const rows = await prisma.studioEntity.findMany({
      where: { userId, status: { in: ["ready", "locked"] } },
      select: { id: true, kind: true, name: true, description: true, references: true },
      orderBy: { updatedAt: "desc" },
      take: 12,
    });
    const out = [];
    if (rows.length) {
      /* A voice on file is not decoration — it is the difference between a
         song sung in the user's voice and a song sung by a stranger. The
         planner could not see it, so it never asked for it, so a music step
         never carried one. Marked per character, because the voice a shot
         uses is the voice of whoever speaks in it. */
      const lines = rows.map((r) => {
        const refs = Array.isArray(r.references) ? r.references : [];
        const voice = refs.some((ref) => ref?.kind === "voice") ? " · VOICE ON FILE" : "";
        return `- ${r.id} · ${r.kind} · ${r.name}${voice}${r.description ? ` — ${r.description.slice(0, 100)}` : ""}`;
      });
      out.push(
        "",
        "",
        "THE USER'S CAST — characters, products and places they have already defined, with reference images on file:",
        lines.join("\n"),
        "",
        "When a step shows one of these, put its id in that step's params.entityIds (an array). Their appearance is then supplied from the real reference photographs — do NOT describe them in the prompt, and never invent a competing description, because a written description that disagrees with the reference is what makes a face drift. A step that shows nobody from this list omits entityIds entirely.",
        "A character marked VOICE ON FILE speaks or sings in their own voice when a step names them in entityIds and the chosen model takes a voice reference — put their id on the music or dialogue step too, not just on the shots they appear in.",
      );
    }

    const brandBlock = await brandHint(userId);
    if (brandBlock) out.push(brandBlock);
    return out.join("\n");
  } catch {
    return "";
  }
}

/* The brand: the logo, the palette, the type.
   ────────────────────────────────────────────────────────────────────────
   A logo is the one image in a production that must not be generated. A
   model asked to draw "the Helmies Studio logo" draws a logo that is not
   theirs — confidently, and in every frame of the end card. The planner had
   no idea a real one was on file, so it had no alternative to inventing one.

   The url is handed over so a title/overlay step can composite the REAL
   mark, and the colours so generated frames sit next to it instead of
   fighting it. */
async function brandHint(userId) {
  try {
    const kit = await prisma.brandKit.findFirst({
      where: { userId, isActive: true },
      orderBy: { updatedAt: "desc" },
      select: { name: true, primaryColors: true, fonts: true, visualReferences: true, toneOfVoice: true },
    });
    if (!kit) return "";
    const refs = Array.isArray(kit.visualReferences) ? kit.visualReferences : [];
    const logo = refs.find((r) => r?.role === "logo" && typeof r?.url === "string");
    const colors = (Array.isArray(kit.primaryColors) ? kit.primaryColors : []).slice(0, 4);
    const fonts = (Array.isArray(kit.fonts) ? kit.fonts : []).slice(0, 3);

    const lines = ["", "", `THE BRAND — "${kit.name}".`];
    if (logo) {
      lines.push(
        `Logo (the real file, already on record): ${logo.url}`,
        "Put THIS url in params.logoUrl on any title/overlay step that shows the mark. NEVER ask an image or video model to draw the logo — a drawn logo is a different logo, and it will be wrong in every frame it appears in.",
      );
    } else {
      lines.push("No logo on file. If the production shows one, say so plainly rather than generating a substitute.");
    }
    if (colors.length) lines.push(`Brand colours: ${colors.join(", ")} — use them for typography and UI accents.`);
    if (fonts.length) lines.push(`Typefaces: ${fonts.join(", ")}.`);
    if (kit.toneOfVoice) lines.push(`Tone: ${kit.toneOfVoice.slice(0, 200)}`);
    return lines.join("\n");
  } catch {
    return "";
  }
}

/* P1.4 — the project the agent is working inside.
   ────────────────────────────────────────────────────────────────────────
   The planner used to be told nothing about the production a request
   belongs to, so every message was planned from scratch: it re-invented
   the format, re-described the cast, and had no idea a scene it was about
   to plan already existed. Handing it the project turns "make scene 5"
   into an instruction it can actually follow.

   The scenario is sent in full up to a cap. It is the single most useful
   thing the planner can have, and truncating it mid-sentence is worse than
   truncating it at a boundary the reader can see. */
async function projectHint(context = {}) {
  const { userId, projectId } = context || {};
  if (!userId || !projectId) return "";
  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { name: true, brief: true, data: true },
    });
    if (!project) return "";

    const s = project.data || {};
    const [entities, scenes] = await Promise.all([
      prisma.studioEntity.findMany({
        where: { projectId, userId },
        select: { id: true, kind: true, name: true },
        take: 24,
      }),
      prisma.directorPipeline.findMany({
        where: { projectId, userId },
        select: { title: true, status: true },
        orderBy: { createdAt: "asc" },
        take: 40,
      }),
    ]);

    const lines = [
      "",
      "",
      `THE PROJECT — everything below is already decided. Do not re-ask for it, and do not contradict it.`,
      `Name: ${project.name}`,
      s.kind ? `Type: ${s.kind}` : null,
      s.aspectRatio ? `Aspect ratio: ${s.aspectRatio} — every shot is this, no exceptions.` : null,
      s.resolution ? `Resolution: ${s.resolution}` : null,
      s.imageModel ? `Image model: ${s.imageModel}` : null,
      s.videoModel ? `Video model: ${s.videoModel}` : null,
    ].filter(Boolean);

    if (entities.length) {
      lines.push(
        "",
        "Filed under this project (use these ids in params.entityIds — their real reference photographs are on file):",
        entities.map((e) => `- ${e.id} · ${e.kind} · ${e.name}`).join("\n"),
      );
    }
    if (scenes.length) {
      lines.push(
        "",
        `Scenes that already exist (${scenes.length}) — do NOT re-plan these unless asked:`,
        scenes.map((p, i) => `${i + 1}. ${p.title} — ${p.status}`).join("\n"),
      );
    }
    if (project.brief) {
      const brief = project.brief.length > 16000
        ? `${project.brief.slice(0, 16000)}\n[…scenario truncated…]`
        : project.brief;
      lines.push("", "The scenario this production is made from:", brief);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

async function requestLlmPlan(userMessage, context = {}) {
  const system = AGENTS.orchestrator.systemPrompt + sessionDefaultsHint(context)
    + (await studioCapabilities()) + (await runnableModelHint(context)) + (await castHint(context))
    + (await projectHint(context));
  const user = buildPlanUserContent(userMessage, context);
  try {
    return await llmPlanOnce([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
  } catch (err) {
    try { log.error("agent_plan_llm_failed", { error: err?.message, willRetry: true }); } catch {}
    try {
      return await llmPlanOnce([
        { role: "system", content: system },
        { role: "user", content: `${user}\n\n${STRICT_JSON_RETRY_HINT}` },
      ]);
    } catch (retryErr) {
      try { log.error("agent_plan_llm_failed", { error: retryErr?.message, willRetry: false, degradedToHeuristic: true }); } catch {}
      return null;
    }
  }
}

// A heuristic plan handed out where the LLM planner was expected must SAY
// SO — production incident: a degraded plan was presented as the real
// thing, and the only tell was its own "Heuristic plan: N step(s)" summary
// text. `planSource` travels to the client, which renders an honest
// "quick draft" notice on the plan card.
async function heuristicFallbackPlan(userMessage, context, { degraded }) {
  const plan = await buildHeuristicPlan(userMessage, context);
  // Same pin-then-quote contract as the LLM paths — an explicit user model
  // request is honored even when the planner degraded to the heuristic.
  pinUserRequestedModels(plan, await resolveUserRequestedModels(context));
  const estimate = await estimateAgentTask(plan.steps || []);
  return { ...plan, estimate, planSource: "heuristic", degraded: !!degraded };
}

// ── Plan a task with token-by-token streaming ──
export async function planTaskStream(userMessage, context = {}) {
  const hasLLM = process.env.OPENROUTER_KEY;

  if (!hasLLM) {
    return { stream: null, plan: await heuristicFallbackPlan(userMessage, context, { degraded: false }) };
  }

  const messages = [
    // The streaming planner gets the same context the non-streaming one
    // does. It diverged once already, and a plan that knows the cast in one
    // path and not the other is the hardest kind of bug to see.
    { role: "system", content: AGENTS.orchestrator.systemPrompt + sessionDefaultsHint(context)
        + (await studioCapabilities()) + (await runnableModelHint(context)) + (await castHint(context)) + (await projectHint(context)) },
    { role: "user", content: buildPlanUserContent(userMessage, context) },
  ];

  let llmReadable;
  try {
    llmReadable = await llmStream(messages, { maxTokens: PLAN_MAX_TOKENS, temperature: 0.3 });
  } catch (err) {
    try { log.error("agent_plan_llm_failed", { error: err?.message, path: "stream", degradedToHeuristic: true }); } catch {}
    return { stream: null, plan: await heuristicFallbackPlan(userMessage, context, { degraded: true }) };
  }

  const encoder = new TextEncoder();
  const reader = llmReadable.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter(l => l.startsWith("data: "));

          for (const line of lines) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || "";
              if (content) {
                buffer += content;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", content })}\n\n`));
              }
            } catch {}
          }
        }

        // After stream ends, parse accumulated text as plan
        let plan;
        try {
          const json = JSON.parse(extractPlanJson(buffer) || "");
          if (!Array.isArray(json.steps) || !json.steps.length) throw new Error("planner reply had no steps");
          // An explicit user model request ("use seedance 2") is pinned onto
          // its kind's steps BEFORE the quote, so the estimate below (and
          // the plan card) shows the real cost of the user's choice.
          pinUserRequestedModels(json, await resolveUserRequestedModels(context));
          const estimate = await estimateAgentTask(json.steps);
          plan = { ...json, estimate, planSource: "llm" };
        } catch (err) {
          try { log.error("agent_plan_llm_failed", { error: err?.message, path: "stream-parse", degradedToHeuristic: true }); } catch {}
          plan = await heuristicFallbackPlan(userMessage, context, { degraded: true });
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "plan", plan })}\n\n`));
      } catch (err) {
        try { log.error("agent_plan_llm_failed", { error: err?.message, path: "stream-read", degradedToHeuristic: true }); } catch {}
        const fallback = await heuristicFallbackPlan(userMessage, context, { degraded: true });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "plan", plan: fallback })}\n\n`));
      }
      controller.close();
    },
  });

  return { stream, plan: null };
}

// ── Plan a task (orchestrator) ──
export async function planTask(userMessage, context = {}) {
  const hasLLM = process.env.OPENROUTER_KEY;

  if (hasLLM) {
    const json = await requestLlmPlan(userMessage, context);
    if (json) {
      // Same pin-then-quote contract as the streaming path: an explicit user
      // model request lands on its kind's steps before the estimate.
      pinUserRequestedModels(json, await resolveUserRequestedModels(context));
      const estimate = await estimateAgentTask(json.steps);
      return { ...json, estimate, planSource: "llm" };
    }
    // requestLlmPlan already retried once and logged both failures loudly.
    return heuristicFallbackPlan(userMessage, context, { degraded: true });
  }

  return heuristicFallbackPlan(userMessage, context, { degraded: false });
}

// The cheapest currently-runnable model for a capability, straight from the
// live catalog (URGENT production fix) — the heuristic planner only runs
// when there's no LLM configured (dev/local, or an OPENROUTER outage), so
// its defaults must never be a hardcoded id that can go stale the way
// "flux-dev"/"kling-v2.1-i2v" did (both isDeprecated in production while
// still hardcoded here). Falls back to LAST_RESORT_FALLBACKS (below) only
// if the live lookup itself is unavailable.
//
// Audio is NOT just "cheapest active+non-deprecated row" (BUG FIX):
// getRunnableModelsForType already applies the runnable gate
// (isActive/isDeprecated — see isRunnableModelRow's header), but ordering
// purely by creditsCost resolved an AUDIO step to "boost-music-style" in
// production — an "enhancement" utility (audioKind, model-catalog-
// core.mjs) that TRANSFORMS an existing track and cannot run as a
// from-scratch step at all. audioKind is the SAME honest sub-classification
// MusicStudio/AudioStudio already gate their pools on; reuse it here to
// prefer a genuine GENERATOR — a composer ("music") for a music/song task,
// a reader ("tts") when the task clearly wants a spoken voice instead —
// over a transformer/enhancement/conversion utility, while keeping every
// row's already-applied runnable gate untouched (this only re-orders rows
// getRunnableModelsForType already returned, never widens what's runnable).
// Falls back to the plain cheapest runnable row only if the catalog has no
// generator of either kind at all — never worse than the old behavior.
// Exported (not just used internally) so it's directly unit-testable
// against a mocked catalog, the same rationale scripts/fix-model-
// categories.mjs's planFixes and this file's own executeStep/
// executeStepWithRetry already use — see tests/unit/agent-model-selection.test.mjs.
// Delegates to the unified worker-safe resolver (src/lib/runnable-models.js)
// — kept as a named export because the heuristic planner AND
// tests/unit/agent-model-selection.test.mjs import it from here.
export async function defaultRunnableModel(agentKind, { wantsVoice = false } = {}) {
  return defaultRunnableModelForKind(agentKind, { wantsVoice });
}

// ── Heuristic plan when no LLM available (or the LLM planner failed) ──────
// A9 rewrite. Two hard-won rules:
//
// 1. CLASSIFY BY THE PRIMARY DELIVERABLE, never by a stray keyword.
//    Production incident: a 30-second launch-film brief contained the
//    section label "Audio: Natural ambient sounds…", the old keyword order
//    matched /audio/ first, and the user was charged for ONE audio
//    generation of an entire film brief. Film/video classes are therefore
//    checked BEFORE any audio/marketing keyword can claim the request.
//
// 2. EMIT COMPLETE PRODUCTIONS with composed content — template strings
//    from the brief, never bare instructions (a voiceover step's text is
//    words a voice can speak; executeVoiceoverStep's guard backstops this).

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// The subject of the production — the brief with its production-speak
// prefix ("Create a 30-second launch film for …") peeled off, so composed
// prompts/narration talk about the THING, not about the film about the
// thing. Falls back to the whole brief when nothing recognizable leads.
export function briefSubject(userMessage) {
  const brief = String(userMessage || "").trim().replace(/\s+/g, " ");
  const stripped = brief
    .replace(/^(please\s+)?(create|make|produce|generate|plan|design|build|shoot|compose|write)\s+/i, "")
    .replace(/^(me\s+|us\s+)?(an?|the)\s+/i, "")
    .replace(/^[\w-]*\s*(launch film|launch video|music video|lyric video|product ad|product film|brand video|promo(?:tional)?(?: video| film)?|commercial|advert(?:isement)?|trailer|film|video|reel|clip)\s*(for|about|of|:)?\s*/i, "")
    .trim();
  return (stripped || brief).slice(0, 220);
}

export async function buildHeuristicPlan(userMessage, context = {}) {
  const lower = userMessage.toLowerCase();
  const settings = context?.settings && typeof context.settings === "object" ? context.settings : {};
  const subject = briefSubject(userMessage);
  const steps = [];

  const isWebsite = /website|landing page|web page|\bhtml\b|\bweb site\b/.test(lower);
  const isMusicVideo = /\bmusic video\b|\blyric video\b/.test(lower);
  // The primary-deliverable classes: a film/commercial/promo/ad brief is a
  // VIDEO PRODUCTION regardless of what its Audio:/Music: section labels say.
  const isFilmPromo = /\b(launch film|launch video|product film|product ad|brand video|promo(?:tional)?(?: video| film)?|commercial|advert(?:isement)?|trailer|\bfilm\b)\b/.test(lower);
  const isCode = /\bcode\b|\bfunction\b|\bcomponent\b|\bapi\b|\bdebug\b|\bbug\b/.test(lower);
  const isMarketing = /\bmarketing\b|\bcampaign\b|\bsocial (media )?post|\bugc\b|ad copy|\bnewsletter\b/.test(lower);
  const isGenericVideo = /video|animate|motion|clip|movie/.test(lower);
  const isAudioOnly = /audio|music|voice|sound|song|singing|narrat|speech|speak/.test(lower);

  const videoModelFor = async () => settings.videoModel || await defaultRunnableModel("video");
  const imageModelFor = async () => settings.imageModel || await defaultRunnableModel("image");
  const musicModelFor = async () => settings.audioModel || await defaultRunnableModel("audio", { wantsVoice: false });
  const ttsModelFor = async () => await defaultRunnableModel("audio", { wantsVoice: true });

  const videoStep = (task, prompt, model) => ({
    agent: "video",
    task,
    params: { model, endpoint: model, prompt, duration: 5, ...(settings.aspect ? { aspect_ratio: settings.aspect } : {}) },
  });

  let summary = "";

  if (isWebsite) {
    steps.push({ agent: "website", task: userMessage, params: { prompt: userMessage } });
    summary = "One-step website build.";
  } else if (isMusicVideo) {
    const videoModel = await videoModelFor();
    const musicModel = await musicModelFor();
    const imageModel = await imageModelFor();
    const ratio = settings.aspect || "16:9";
    // Storyboard-first (2026-08-06): step 1 is the storyboard the user
    // accepts or edits at the plan card; scene stills are generated from it
    // (the \${storyboard} token is replaced at run time with the ACCEPTED
    // JSON) and each clip animates its own still, so the video matches the
    // storyboard instead of drifting.
    const storyboard = {
      scenario: `A music video for ${subject}: three scenes following one visual idea, cut to the rhythm of the track.`,
      characters: [],
      scenes: [
        { id: 1, title: "Opening", description: `Wide establishing scene for ${subject}`, location: "Studio set", time: "Night", camera: "Slow push-in", characters: [] },
        { id: 2, title: "Feature", description: `Dynamic feature scene for ${subject}`, location: "Studio set", time: "Night", camera: "Medium close-up, rhythmic motion", characters: [] },
        { id: 3, title: "Finale", description: `Sweeping finale scene for ${subject}`, location: "Studio set", time: "Night", camera: "Wide pull-out", characters: [] },
      ],
    };
    const still = (title, shot) => ({
      agent: "image",
      task: `Scene still 1 — ${title}`,
      params: { model: imageModel, endpoint: imageModel, prompt: `${shot} Storyboard: \${storyboard}`, aspect_ratio: ratio, referenceOnly: true },
    });
    steps.push(
      { agent: "storyboard", task: "Storyboard — scenes and shot plan", params: { brief: userMessage, storyboard } },
      // One establishing still; clips 2+ chain from the previous clip's
      // last frame (the run injects it) so the video stays consistent.
      still("Opening", `Opening scene for ${subject}: wide establishing frame, cinematic lighting, slow push-in, rich color grade.`),
      { agent: "video", task: "Clip 1 — opening", params: { model: videoModel, endpoint: videoModel, image_url: "$STEP_2_OUTPUT", prompt: `Push slowly into the opening scene for ${subject}.`, duration: 5, aspect_ratio: ratio } },
      { agent: "video", task: "Clip 2 — feature", params: { model: videoModel, endpoint: videoModel, prompt: `Continue from where the opening ended: feature shot for ${subject}, rhythmic motion, dramatic side light, shallow depth of field.`, duration: 5, aspect_ratio: ratio } },
      { agent: "video", task: "Clip 3 — finale", params: { model: videoModel, endpoint: videoModel, prompt: `Continue from where the feature shot ended: finale for ${subject}, sweeping wide angle, slow pull-out ending on a striking silhouette.`, duration: 5, aspect_ratio: ratio } },
      {
        agent: "music",
        task: "Original track",
        params: { model: musicModel, endpoint: musicModel, prompt: `Original track for ${subject}: driving rhythm, cinematic build, modern polished production, memorable hook.`, duration: 30 },
      },
      { agent: "assembly", task: "Join the clips into the final cut", params: {} },
      { agent: "export", task: "Final music video", params: { name: "Music video" } },
    );
    summary = `Complete music video for ${subject}: storyboard first, three storyboard-matched clips, an original track, assembled into one final video.`;
  } else if (isFilmPromo) {
    const imageModel = await imageModelFor();
    const videoModel = await videoModelFor();
    const musicModel = await musicModelFor();
    const ttsModel = await ttsModelFor();
    const ratio = settings.aspect || "16:9";
    const narration = `Some things are worth slowing down for. ${capitalize(subject)} — crafted with care, made for real life. Experience it for yourself, today.`;
    // Storyboard-first: the accepted storyboard drives the hero still and
    // both clips (still → \${storyboard} → clip image_url chain).
    const storyboard = {
      scenario: `A ${ratio === "9:16" ? "vertical" : "widescreen"} launch film for ${subject}: warm light, premium texture, a calm build from detail to full hero moment.`,
      characters: [],
      scenes: [
        { id: 1, title: "Opening", description: `Slow reveal of ${subject} in warm natural light`, location: "Softly lit interior", time: "Morning", camera: "Slow drift, gentle push-in", characters: [] },
        { id: 2, title: "Closing", description: `Hero framing of ${subject} in golden-hour glow`, location: "Softly lit interior", time: "Golden hour", camera: "Slow motion, confident final hold", characters: [] },
      ],
    };
    steps.push(
      { agent: "storyboard", task: "Storyboard — scenes and shot plan", params: { brief: userMessage, storyboard } },
      // One establishing still (referenceOnly — an internal reference, not
      // part of the final output); clip 2 chains from clip 1's last frame.
      {
        agent: "image",
        task: "Scene still 1 — establishing",
        params: { model: imageModel, endpoint: imageModel, prompt: `Establishing scene of ${subject}: cinematic composition, soft key light, shallow depth of field, premium product photography. Storyboard: \${storyboard}`, aspect_ratio: ratio, referenceOnly: true },
      },
      { agent: "video", task: "Clip 1 — opening", params: { model: videoModel, endpoint: videoModel, image_url: "$STEP_2_OUTPUT", prompt: `Opening shot for ${subject}: slow reveal, warm natural light, gentle camera drift, inviting atmosphere.`, duration: 5, aspect_ratio: ratio } },
      { agent: "video", task: "Clip 2 — closing", params: { model: videoModel, endpoint: videoModel, prompt: `Continue from where the opening shot ended: closing shot for ${subject}, hero framing, golden-hour glow, subtle slow motion, confident final hold.`, duration: 5, aspect_ratio: ratio } },
      {
        agent: "voiceover",
        task: "Narration",
        params: { model: ttsModel, endpoint: ttsModel, text: narration, prompt: narration },
      },
      {
        agent: "music",
        task: "Underscore",
        params: { model: musicModel, endpoint: musicModel, prompt: `Warm, uplifting underscore for ${subject}: gentle build, soft percussion, modern cinematic production, understated and premium.`, duration: 30 },
      },
      { agent: "assembly", task: "Join the clips into the final cut", params: {} },
      { agent: "export", task: "Final film", params: { name: "Final film" } },
    );
    summary = `Complete production for ${subject}: storyboard first, hero still and storyboard-matched clips, narration and underscore, assembled into the final film.`;
  } else if (isCode) {
    steps.push({ agent: "coding", task: userMessage, params: { prompt: userMessage } });
    summary = "One-step coding task.";
  } else if (isMarketing) {
    steps.push({ agent: "marketing", task: userMessage, params: { prompt: userMessage } });
    summary = "One-step marketing content task.";
  } else if (isGenericVideo) {
    const imageModel = await imageModelFor();
    const videoModel = await videoModelFor();
    const ratio = settings.aspect || "16:9";
    // Storyboard-first, same contract as the film branches: the accepted
    // storyboard drives the still, the still drives the clip.
    const storyboard = {
      scenario: `A short animated clip of ${subject}.`,
      characters: [],
      scenes: [
        { id: 1, title: "The shot", description: userMessage, location: "Set", time: "Unspecified", camera: "Gentle motion", characters: [] },
      ],
    };
    steps.push(
      { agent: "storyboard", task: "Storyboard — scene and shot plan", params: { brief: userMessage, storyboard } },
      {
        agent: "image",
        task: userMessage,
        params: { model: imageModel, endpoint: imageModel, prompt: `${userMessage} Storyboard: \${storyboard}`, aspect_ratio: ratio, referenceOnly: true },
      },
      { agent: "video", task: "Animate the generated image", params: { model: videoModel, endpoint: videoModel, image_url: "$STEP_2_OUTPUT", prompt: userMessage, duration: 5, aspect_ratio: ratio } },
      { agent: "export", task: "Final clip", params: { name: "Final clip" } },
    );
    summary = `Storyboard, still, and animated clip for ${subject}.`;
  } else if (isAudioOnly) {
    // Only reached when NO film/video class claimed the brief — a genuine
    // audio-first request. Voice vs music by explicit voice words, exactly
    // as before, but emitted as the honest step kind so the voiceover
    // guard and per-kind model pools apply.
    const wantsVoice = /voice|narrat|speak|read aloud|speech/.test(lower) && !/music|song|singing/.test(lower);
    const audioModel = await defaultRunnableModel("audio", { wantsVoice });
    if (wantsVoice) {
      steps.push({ agent: "voiceover", task: userMessage, params: { model: audioModel, endpoint: audioModel, text: userMessage, prompt: userMessage } });
      summary = "One voiceover recording.";
    } else {
      steps.push({ agent: "music", task: userMessage, params: { model: settings.audioModel || audioModel, endpoint: settings.audioModel || audioModel, prompt: userMessage, duration: 30 } });
      summary = "One original music track.";
    }
  } else {
    const imageModel = await imageModelFor();
    steps.push({ agent: "image", task: userMessage, params: { model: imageModel, endpoint: imageModel, prompt: userMessage, aspect_ratio: settings.aspect || "1:1" } });
    summary = "One image generation.";
  }

  return { steps, summary };
}

// ── Execute a single step ──
export async function executeStep(step, previousOutputs = [], options = {}) {
  const { agent, params } = step;

  let resolvedParams = { ...params };
  // The storyboard step (always step 1 of a video production) is the single
  // source of truth for character/scene consistency: every later step whose
  // prompt embeds the ${storyboard} token gets the ACCEPTED storyboard JSON
  // injected here, so user edits at plan approval flow into character
  // sheets, scene stills and clips automatically.
  const storyboardOutput = previousOutputs.find((o) => typeof o === "string" && /"scenes"\s*:/.test(o)) || previousOutputs[0];
  for (const [key, value] of Object.entries(resolvedParams)) {
    if (typeof value === "string" && value.startsWith("$STEP_")) {
      const stepNum = parseInt(value.match(/\d+/)?.[0]) - 1;
      if (previousOutputs[stepNum]) resolvedParams[key] = previousOutputs[stepNum];
    } else if (typeof value === "string" && value.includes("${storyboard}") && storyboardOutput) {
      resolvedParams[key] = value.replaceAll("${storyboard}", storyboardOutput);
    }
  }

  const normalized = normalizeAgentKey(agent);

  switch (normalized) {
    case "image":
      return await executeImageStep(resolvedParams);
    case "video":
      return await executeVideoStep(resolvedParams);
    case "storyboard":
      return await executeStoryboardStep(resolvedParams);
    case "audio":
      return await executeAudioStep(resolvedParams);
    // ── EDITSv1 E5.1 — the workflow step kinds ─────────────────────────
    // WorkflowStudio stores a step's KIND verbatim as its `agent`, so every
    // kind the builder offers needs a case here. Without one they fell
    // through to the generic-LLM default below and quietly returned prose
    // where the user had paid for a video, an upscale or a finished cut.
    case "i2v":
      return await executeI2VStep(resolvedParams, previousOutputs);
    case "upscale":
      return await executeUpscaleStep(resolvedParams, previousOutputs);
    case "music":
      return await executeMusicStep(resolvedParams);
    case "voiceover":
      return await executeVoiceoverStep(resolvedParams);
    case "title":
      return await executeTitleStep(resolvedParams, previousOutputs);
    case "production":
      return JSON.stringify(await runProductionStep(resolvedParams, { userId: options.userId }));
    case "assembly":
      return await executeAssemblyStep(resolvedParams, previousOutputs);
    case "export":
      return await executeExportStep(resolvedParams, previousOutputs, step);
    case "website":
      return await executeWebsiteStep(resolvedParams);
    case "marketing":
      return await executeMarketingStep(resolvedParams);
    case "coding":
      return await executeCodingStep(resolvedParams);
    default: {
      if (AGENTS[normalized] && !TOOL_AGENT_KEYS.has(normalized)) {
        // A registered persona agent (creative_director, image_director, ...).
        // These are system-prompt roles, not tool runners — run them as a
        // single LLM completion using their own systemPrompt.
        return await executePersonaStep(normalized, resolvedParams, step.task);
      }
      // The orchestrator LLM invented an agent name that matches nothing in
      // the registry. A plan must never hard-crash over this — log it and
      // fall back to a generic LLM step so the run can still complete.
      console.warn(`[agents] Unknown agent "${agent}" (normalized: "${normalized}") — falling back to a generic LLM step.`);
      return await executePersonaStep(null, resolvedParams, step.task);
    }
  }
}


// Execute a persona step as an LLM completion using the persona's own
// systemPrompt (or a generic fallback for an unrecognized agent name),
// returning its text. Reuses the existing llmComplete helper — no new
// provider path.
async function executePersonaStep(agentKey, params, task) {
  const systemPrompt = (agentKey && AGENTS[agentKey]?.systemPrompt) || GENERIC_PERSONA_PROMPT;
  const userContent = params?.prompt || params?.task || task || "Proceed with your role for this step.";
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: typeof userContent === "string" ? userContent : JSON.stringify(userContent) },
  ];
  return await llmComplete(messages, { maxTokens: 2000, temperature: 0.5 });
}

async function executeImageStep(params) {
  const endpoint = params.endpoint || params.model;
  const provider = await resolveProvider(params.model || endpoint);
  if (params.image_url || params.images_list?.length) {
    const result = await generateI2I({ endpoint, ...params, _provider: provider });
    return result.url || result.outputs?.[0];
  }
  const result = await generateImage({ endpoint, ...params, _provider: provider });
  return result.url || result.outputs?.[0];
}

async function executeVideoStep(params) {
  const endpoint = params.endpoint || params.model;
  const provider = await resolveProvider(params.model || endpoint);
  if (params.image_url) {
    const result = await generateI2V({ endpoint, ...params, _provider: provider });
    return result.url || result.outputs?.[0];
  }
  const result = await generateVideo({ endpoint, ...params, _provider: provider });
  return result.url || result.outputs?.[0];
}

/* ══════════════════════════════════════════════════════════════════════════
   STORYBOARD STEP — the first step of every video production (2026-08-06)
   ──────────────────────────────────────────────────────────────────────────
   The planner drafts the full storyboard (scenario, every character with
   full-body + face-angle shots, every scene) and embeds it as
   params.storyboard, so the plan card can show it for accept/edit BEFORE
   anything generates. This executor is then a pure pass-through for the
   APPROVED draft — zero LLM calls, zero credits. Only when a plan arrives
   without a draft (e.g. an old approved plan) does it generate one, using
   the same strict JSON contract the planner was told to emit, so the
   ${storyboard} token downstream steps embed resolves to the same shape
   either way.
   ══════════════════════════════════════════════════════════════════════════ */
const STORYBOARD_JSON_HINT =
  'Reply with ONLY one valid JSON object — no markdown fences, no commentary: {"scenario":"<one-paragraph narrative of the whole video>","characters":[{"name":"<name>","role":"<role>","appearance":"<same words every sheet reuses>","shots":["full body","face front","face side","face 3/4"]}],"scenes":[{"id":1,"title":"<scene title>","description":"<what happens, where, who>","location":"<setting>","time":"<time of day>","camera":"<shot size and movement>","characters":["<names from characters>"]}]}';

function parseStoryboard(text) {
  const json = extractPlanJson(text);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && Array.isArray(parsed.scenes) ? parsed : null;
  } catch {
    return null;
  }
}

async function executeStoryboardStep(params) {
  const draft = typeof params?.storyboard === "string" ? parseStoryboard(params.storyboard)
    : params?.storyboard && typeof params.storyboard === "object" ? params.storyboard : null;
  if (draft) {
    // The accepted draft — deterministic, free, and exactly what the user
    // approved (or edited) at the plan card.
    return JSON.stringify(draft);
  }
  const brief = params?.brief || params?.prompt || params?.task || "A short video";
  const messages = [
    { role: "system", content: AGENTS.storyboard.systemPrompt },
    { role: "user", content: `${brief}\n\n${STORYBOARD_JSON_HINT}` },
  ];
  let parsed = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const reply = await llmComplete(messages, { maxTokens: 3000, temperature: 0.4 });
    parsed = parseStoryboard(reply);
    if (!parsed && attempt === 0) {
      messages.push({ role: "user", content: STRICT_JSON_RETRY_HINT });
    }
  }
  if (!parsed) throw new Error("The storyboard draft could not be parsed. Please try again.");
  return JSON.stringify(parsed);
}

async function executeAudioStep(params) {
  const endpoint = params.endpoint || params._modelId || params.model;
  const provider = await resolveProvider(params._modelId || params.model || endpoint);
  const result = await generateAudio({ endpoint, ...params, _provider: provider });
  return result.url || result.outputs?.[0];
}

/* ══════════════════════════════════════════════════════════════════════════
   EDITSv1 E5.1 — WORKFLOW STEP KINDS
   ──────────────────────────────────────────────────────────────────────────
   A pipeline is a straight line, so a step's inputs are simply what came
   before it. These executors read backwards through `previousOutputs` for
   the right KIND of thing (a still to animate, clips to join) rather than
   making the user wire every link by hand — an explicit $STEP_N_OUTPUT in
   the step's params still wins, because it was resolved before dispatch.

   `assembly` and `export` never touch a provider: one shells out to ffmpeg
   through video-assembly.js, the other only describes what the run produced.
   Their prices live in pricing-engine.js's NON_PROVIDER_STEP_CREDITS, fixed
   server-side, so the quote the builder shows and the credits the run
   reserves are the same number.
   ══════════════════════════════════════════════════════════════════════════ */

const isMediaUrl = (v) => typeof v === "string" && /^(https?:\/\/|\/)/.test(v.trim());
// Same two heuristics WorkflowStudio uses to decide what a URL is, so the
// builder's thumbnails and the engine's step wiring never disagree: the file
// extension, plus the "/video/" path segment some delivery URLs carry
// instead of one.
const isVideoOutput = (v) => isMediaUrl(v) && (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(v) || v.includes("/video/"));
const isAudioOutput = (v) => isMediaUrl(v) && /\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i.test(v);
const isImageOutput = (v) => isMediaUrl(v) && !isVideoOutput(v) && !isAudioOutput(v);

// The newest earlier output that is a still image. Videos and audio are
// skipped rather than mistaken for a frame.
function latestImageOutput(previousOutputs = []) {
  for (let i = previousOutputs.length - 1; i >= 0; i--) {
    if (isImageOutput(previousOutputs[i])) return previousOutputs[i];
  }
  return null;
}

// Image → Video. The still comes from the step's own image_url when one was
// wired, otherwise from the most recent earlier image.
async function executeI2VStep(params, previousOutputs) {
  const image = isMediaUrl(params.image_url) ? params.image_url : latestImageOutput(previousOutputs);
  if (!image) {
    throw new Error("This step animates an image, but no earlier step produced one. Add an image step before it.");
  }
  const endpoint = params.endpoint || params.model;
  const provider = await resolveProvider(params.model || endpoint);
  const result = await generateI2V({ ...params, endpoint, image_url: image, _provider: provider });
  return result.url || result.outputs?.[0];
}

// Upscale — an image-to-image route with an upscaling model.
async function executeUpscaleStep(params, previousOutputs) {
  const image = isMediaUrl(params.image_url) ? params.image_url : latestImageOutput(previousOutputs);
  if (!image) {
    throw new Error("This step enlarges an image, but no earlier step produced one. Add an image step before it.");
  }
  const endpoint = params.endpoint || params.model;
  const provider = await resolveProvider(params.model || endpoint);
  const result = await generateI2I({ ...params, endpoint, image_url: image, _provider: provider });
  return result.url || result.outputs?.[0];
}

/* Typography. No provider, no model, no credits beyond the flat
   NON_PROVIDER_STEP_CREDITS rate — this is ffmpeg drawing the brand's own
   typeface, so the words are exactly the words the plan approved.

   Mirrors the durable runner's `title` branch (agent-runner.js); the shared
   half lives in title-step.mjs so the two can never disagree about what a
   card looks like. */
async function executeTitleStep(params, previousOutputs = []) {
  const lines = titleLines(params, { height: 1080 });
  if (!lines.length) throw new Error("A title step needs a headline or a subtitle to draw.");
  const logoUrl = typeof params.logoUrl === "string" && params.logoUrl ? params.logoUrl : null;
  const over = params.over === false ? null : previousOutputs.filter(isVideoOutput).pop() || null;
  const result = over
    ? await overlayTitles(over, { lines, logoUrl, logoWidth: params.logoWidth })
    : await renderTitleCard({
      lines,
      duration: titleDuration(params, lines),
      background: params.background || "black",
      logoUrl,
      logoWidth: params.logoWidth,
    });
  return result.url;
}

// Music and voiceover are the same audio route with different model pools —
// the builder filters music models by audioKind and speech models by their
// text-to-speech capability, and the prompt carries the lyric brief or the
// line to read. Named separately so a step says what it is on the chain and
// so each gets its own quote.
async function executeMusicStep(params) {
  return await executeAudioStep(params);
}

// A9 safety guard (owner defect 1: "the voiceover SAYS the prompt"): the
// planner contract puts the FINISHED narration in params.text, but plans
// can be old, heuristic, or hand-edited — so the execution path runs the
// cheap instruction-shape detector and, when it triggers, spends ONE
// llmComplete call turning the instruction into the script it asked for.
// The TTS model then speaks the script, never the instruction. On a rewrite
// failure the original text still runs (a paid step must not die on an LLM
// hiccup — and the planner contract remains the first line of defense).
async function executeVoiceoverStep(params) {
  const script = [params.text, params.prompt].find((v) => typeof v === "string" && v.trim())?.trim() || "";
  let finalScript = script;
  if (isVoiceoverInstruction(script)) {
    try {
      const rewritten = await llmComplete([
        { role: "system", content: "You write final narration scripts for text-to-speech. Reply with ONLY the exact words the voice should speak — no title, no quotes, no stage directions, no commentary." },
        { role: "user", content: `Write the final narration script for: ${script}` },
      ], { maxTokens: 800, temperature: 0.6 });
      if (typeof rewritten === "string" && rewritten.trim()) finalScript = rewritten.trim();
    } catch { /* speak the original rather than fail the paid step */ }
  }
  const next = { ...params };
  if (finalScript) {
    next.text = finalScript;
    next.prompt = finalScript;
  }
  return await executeAudioStep(next);
}

// Assembly — joins every video this run has produced so far, in order.
// Server-side only: the clip list is derived from the run's own outputs, so
// a caller can never point it at a URL of their choosing.
async function executeAssemblyStep(params, previousOutputs = []) {
  const clips = previousOutputs.filter(isVideoOutput);
  if (!clips.length) {
    throw new Error("This step joins the video clips made earlier in the chain, but none were produced. Add a video step before it.");
  }
  const options = {};
  if (typeof params?.transition === "string" && params.transition) options.transition = params.transition;
  if (params?.transitionDuration != null) options.transitionDuration = params.transitionDuration;
  const joined = await assembleVideos(clips, options);

  /* The last mile — see agent-runner.js's assembly branch for why joining
     the clips is not a finished film. Mirrored here so a run on the
     synchronous path produces the same deliverable as one on the queue. */
  /* The score is named EXPLICITLY, never guessed.
     ────────────────────────────────────────────────────────────────────
     The tempting shortcut is "use whatever audio came earlier". It is
     wrong: a voiceover step produces audio too, and a plan with both would
     duck the narration against itself and drop the music entirely. So the
     plan wires the music step's output in by hand ($STEP_N_OUTPUT), which
     is a token the runner already resolves, and a plan that does not ask
     for a score simply does not get one. */
  const score = typeof params?.musicUrl === "string" && params.musicUrl ? params.musicUrl : null;
  const runtime = Number(params?.seconds ?? params?.duration) || null;
  if (!score && !runtime) return joined;

  const finished = await renderFinalCut({
    videoUrl: joined,
    musicUrl: score,
    seconds: runtime,
    ...(params?.musicGain != null ? { musicGain: Number(params.musicGain) } : {}),
  });
  return finished.url;
}

// Export — the closing step. Costs nothing and generates nothing: it names
// the deliverable and lists everything the run made, so the finished chain
// hands back one thing to open and a record of how it got there.
function manifestEntry(output, index) {
  const step = index + 1;
  if (isVideoOutput(output)) return { step, type: "video", url: output };
  if (isAudioOutput(output)) return { step, type: "audio", url: output };
  if (isImageOutput(output)) return { step, type: "image", url: output };
  if (typeof output === "string") return { step, type: "text", text: output.slice(0, 2000) };
  return { step, type: "data", data: output ?? null };
}

async function executeExportStep(params, previousOutputs = [], step = null) {
  const manifest = previousOutputs.map(manifestEntry);
  // The deliverable is the newest video (an assembled cut is a video, and it
  // is by construction the last one), else the newest file of any kind.
  const deliverable =
    [...previousOutputs].reverse().find(isVideoOutput) ||
    [...previousOutputs].reverse().find(isMediaUrl) ||
    null;

  return {
    kind: "export",
    name: params?.name || step?.task || "Deliverable",
    url: deliverable,
    manifest,
  };
}

// ── Runnable-model resolution for the executor (URGENT production fix) ────
// Only these three agent kinds name a real ModelPricing-backed provider
// model — the EDITSv1 E5.1 workflow step kinds (i2v/upscale/music/
// voiceover/assembly/export) and the persona/website/coding kinds have
// nothing here to validate, exactly like the FALLBACKS object this section
// replaces only ever had image/video/audio keys.
const CATALOG_MODEL_KINDS = new Set(["image", "video", "audio"]);

// Last-resort only — used when the live getRunnableModelsForType lookup
// (src/lib/model-catalog.js) returns nothing at all, e.g. the catalog
// genuinely has no active row of this kind left. Every id below was
// confirmed `managedBySync: true` with a non-null endpoint (i.e. genuinely
// active) as of the production forensics this fix is built from — this is
// NOT the primary fallback source (the live catalog lookup above always is)
// and every real request already needs the DB reachable for the wallet/
// AgentRun checks before code ever reaches this point, so this only fires
// when the catalog itself is empty of runnable rows, not when the DB is
// merely slow/unreachable.
// LAST_RESORT_FALLBACKS, verifyLastResortIds and the substitution/fallback
// pool logic now live in src/lib/runnable-models.js (Phase 0.2) so the
// worker-side runners use the exact same rules; thin wrappers below keep
// this module's internal call sites unchanged.

// Thin wrapper over runnable-models.js pickSubstituteModel, injecting this
// app's server-side quoter (pricing-engine uses "@/" aliases, so the shared
// module takes the estimate function as a parameter to stay worker-safe).
async function pickSubstituteModel(agentKind, excludeModel, params, ceiling) {
  return pickSharedSubstituteModel({ agentKind, excludeModel, params, ceiling, estimateFn: estimateCredits });
}

// Additional retry-chain candidates (beyond the primary slot) for a step —
// replaces the old hardcoded FALLBACKS object with a live catalog lookup so
// a provider deprecating one model can never again take down the whole
// chain with it (production incident: FALLBACKS.image WAS flux-dev →
// nano-banana → qwen-image; the first two are isActive:false +
// isDeprecated:true in production). Falls back to LAST_RESORT_FALLBACKS
// only when the live lookup returns nothing, and only ids
// verifyLastResortIds confirms are still actually runnable.
async function getFallbackModels(agentKind, excludeModelIds = [], limit = 2) {
  return getFallbackCandidates(agentKind, excludeModelIds, limit);
}

// ── Retry with fallback model + provider (budget-aware, EDITSv1 E3.2) ──
// Returns { output, credits, model }. `budget` is { quoted, max }:
//   - quoted: the server-computed credits for the step's PLANNED model —
//     what a successful un-swapped execution costs.
//   - max: the most this step may cost without pushing the run's total
//     debits above what the user approved. A fallback model swap re-quotes
//     server-side; a fallback whose re-quote exceeds `max` is skipped, and
//     if no affordable fallback succeeds, the step FAILS with the original
//     error. Failing is always preferred to overspending.
//
// URGENT production fix: before ever attempting the step as planned, the
// named model (image/video/audio only — see CATALOG_MODEL_KINDS) is
// checked against the live catalog. A model that's gone inactive/deprecated
// (flux-dev, nano-banana in production) is swapped for the best runnable
// substitute right here — capped at `budget.max` when a budget is given —
// instead of wasting a real provider call on something guaranteed to fail.
// If NO runnable model exists for this capability at all, the step fails
// immediately with a clear, actionable error instead of a raw provider 500.
export async function executeStepWithRetry(step, previousOutputs, attempt = 0, budget = null, options = {}) {
  const agentKind = normalizeAgentKey(step.agent);
  const originalModel = step.params?.model || step.params?._modelId || null;
  const ceiling = budget && typeof budget.max === "number" ? budget.max : null;

  let primary = { step, credits: budget && typeof budget.quoted === "number" ? budget.quoted : null };
  if (originalModel && CATALOG_MODEL_KINDS.has(agentKind)) {
    const runnableRow = await resolveRunnableModel(originalModel).catch(() => null);
    // A runnable row can still be WRONG FOR THIS STEP: a model whose schema
    // requires an image/video/audio upload (motion-control, transition,
    // reference-to-video — see requiresMediaInput's header in
    // model-catalog-core.mjs) cannot run on a text-only step; the provider
    // rejects it outright (measured 2026-08-06: kling-3.0/motion-control →
    // 500 "This field is required", pixverse-v6/transition → 422
    // "first_frame_image_url cannot be empty"). Substitute it exactly like
    // an unrunnable model — the substitute pool is the same gated
    // getRunnableModelsForType — instead of wasting a provider call on a
    // guaranteed rejection.
    const stepMedia = step.params?.image_url || step.params?.images_list?.length || step.params?.videos_list?.length
      || step.params?.audio_url || step.params?.input_urls?.length || step.params?.video_urls?.length;
    if (!runnableRow || (requiresMediaInput(runnableRow) && !stepMedia)) {
      const sub = await pickSubstituteModel(agentKind, originalModel, step.params, ceiling);
      if (!sub) {
        const err = new Error(`No runnable ${agentKind} model is currently available to replace "${originalModel}". Please try again once a provider model is re-enabled.`);
        err.code = "model_unavailable";
        throw err;
      }
      const newParams = { ...step.params, model: sub.model, endpoint: sub.model };
      delete newParams._provider; // re-resolve the provider for the substituted model
      primary = { step: { ...step, params: newParams }, credits: sub.credits };
    }
  }

  const excludeIds = [originalModel, primary.step.params?.model].filter(Boolean);
  const liveFallbacks = await getFallbackModels(agentKind, excludeIds).catch(() => []);

  const candidates = [primary];
  for (const fbModel of liveFallbacks) {
    candidates.push({
      step: { ...step, params: { ...step.params, model: fbModel, endpoint: fbModel } },
      fallbackModel: fbModel,
    });
  }

  let firstError = null;
  for (let i = attempt; i < candidates.length; i++) {
    const candidate = candidates[i];
    let credits = candidate.credits ?? null;

    if (budget && candidate.fallbackModel) {
      try {
        credits = await estimateCredits(agentKind, candidate.fallbackModel, candidate.step.params);
      } catch {
        continue; // an unquotable fallback is never executed on a budgeted run
      }
      if (typeof budget.max === "number" && credits > budget.max) continue;
    }

    try {
      const output = await executeStep(candidate.step, previousOutputs, options);
      return { output, credits, model: candidate.step.params?.model || null };
    } catch (error) {
      if (!firstError) firstError = error;
    }
  }

  throw firstError || new Error("Step failed");
}

async function executeWebsiteStep(params) {
  const messages = [
    { role: "system", content: AGENTS.website.systemPrompt },
    { role: "user", content: params.prompt || params.task },
  ];
  const code = await llmComplete(messages, { maxTokens: 8000, temperature: 0.5 });
  return code;
}

async function executeMarketingStep(params) {
  if (params.images_list?.length || params.video_files?.length) {
    const result = await generateMarketingAd(params);
    return result.url || result.outputs?.[0];
  }
  const messages = [
    { role: "system", content: AGENTS.marketing.systemPrompt },
    { role: "user", content: params.prompt || params.task },
  ];
  const content = await llmComplete(messages, { maxTokens: 2000, temperature: 0.7 });
  return content;
}

async function executeCodingStep(params) {
  const messages = [
    { role: "system", content: AGENTS.coding.systemPrompt },
    { role: "user", content: params.prompt || params.task },
  ];
  const code = await llmComplete(messages, { maxTokens: 6000, temperature: 0.3 });
  return code;
}
