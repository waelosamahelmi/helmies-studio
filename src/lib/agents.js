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
import { resolveRunnableModel, getRunnableModelsForType } from "@/lib/model-catalog";
import { runnableProviderModelId, audioKind, requiresMediaInput } from "@/lib/model-catalog-core.mjs";
import { isVoiceoverInstruction } from "@/lib/voiceover-guard";
import { chainStepIfNeeded } from "@/lib/video-chain";
import { log } from "@/lib/log";
import prisma from "@/lib/prisma";

// ── Agent definitions ──
const AGENTS = {
  orchestrator: {
    name: "Orchestrator",
    description: "Main coordinator. Estimates credits, routes tasks, retries failures, assembles outputs.",
    systemPrompt: `You are Helmies Studio's Orchestrator Agent. You break down user requests into steps, estimate credit costs, and route each step to the right specialist agent.

Available specialist agents:
- creative_director: Brief interpretation, concept, narrative, visual direction, overall coherence
- image_director: Image generation strategy, reference selection, T2I/I2I/edit route, composition
- video_director: Motion, shot duration, first/last frames, image-to-video strategy
- brand_guardian: Brand palette, logo use, typography, visual style, tone constraints
- prompt_engineer: Prompt dialect, model guide, negative prompt, immutable constraints
- storyboard: Shot list, continuity, camera, pacing
- audio_agent: TTS, voice, music, sound effects, timing
- vision_analyst: Scene caption, objects, OCR, palette, lighting, visual style
- quality_control: Prompt alignment, brand alignment, reference consistency, rerun recommendations
- cost_optimizer: Model comparisons, cost/quality tradeoff, budget-aware alternatives
- assembly: Final sequence, media ordering, deliverables
- image: Generate or edit images (Flux, Midjourney, GPT-4o, etc.)
- video: Generate videos (Sora 2, Kling, Veo 3, etc.)
- audio: Generate music, voice, sound effects
- website: Build websites from prompts
- marketing: Create marketing content, ads, social media posts
- coding: Write, debug, or explain code

For complex creative requests, delegate planning to the creative_director and use specialists for their domain. For simple requests, use the tool agents (image/video/audio) directly.

PLAN THE COMPLETE PRODUCTION — never a fragment:
- Enumerate EVERY asset the request implies, one step per asset: each individual image, each individual video clip, the music track, the voiceover. A one-step plan is only correct when the user asked for exactly one asset.
- A music video = several video-clip steps + one "music" step + "assembly". A promo/launch film = hero image(s) + video clips + a "voiceover" step + a "music" step + "assembly". A product ad = product stills + clips + voiceover + music + assembly.
- Whenever the plan produces MORE THAN ONE timed asset (video clips, music, voiceover), add an "assembly" step to join them into the final cut, and finish with an "export" step that names the deliverable.
- Asset step agents: "image", "video", "i2v" (animate an earlier image), "music", "voiceover", "assembly", "export".

STORYBOARD-FIRST — REQUIRED for every production that contains video clips (film, launch video, music video, promo, ad with motion, social reel):
- Step 1 is ALWAYS a "storyboard" step. Its params.storyboard is the COMPLETE storyboard JSON you draft right here, covering the WHOLE video:
  { "scenario": "<one-paragraph narrative of the whole video>", "characters": [ { "name": "<character name>", "role": "<role in the story>", "appearance": "<hair, skin, build, clothing, distinguishing marks — the SAME words every sheet reuses>", "shots": ["full body", "face front", "face side", "face 3/4"] } ], "scenes": [ { "id": 1, "title": "<scene title>", "description": "<what happens, where, who is in it>", "location": "<setting>", "time": "<time of day>", "camera": "<shot size and movement>", "characters": ["<names from the characters list>"] } ] }
  Include EVERY character that appears (main and background), with shots covering full body and face angles so a character sheet can be generated. Include every scene of the whole video.
- Then, one "image" step per character — marked referenceOnly (an internal reference, never part of the final output): { "agent": "image", "task": "Character sheet — <name>", "params": { "model": "<runnable image model>", "prompt": "Character sheet for <name>: <appearance>, full body + face front + face side + face 3/4 views, same person in every view, consistent outfit, neutral background. Storyboard: \${storyboard}", "aspect_ratio": "1:1", "referenceOnly": true } } — the \${storyboard} token is replaced at run time with the accepted storyboard, so the sheet matches it exactly.
- Then, ONE "image" step for the FIRST scene — the establishing still, also referenceOnly: { "agent": "image", "task": "Scene still 1 — <title>", "params": { "model": "<runnable image model>", "prompt": "<the first scene composed as a cinematic still, subject/composition/lighting/camera — 15-40 words>. Storyboard: \${storyboard}", "aspect_ratio": "<same ratio as the video, e.g. 9:16>", "referenceOnly": true } }.
- Then, one "video" step PER SCENE. The FIRST clip animates the establishing still: { "agent": "video", "task": "Clip 1 — <title>", "params": { "model": "<runnable video model>", "image_url": "$STEP_<n>_OUTPUT", "prompt": "<the motion: what moves, how, camera behavior — 15-40 words>", "aspect_ratio": "<same ratio>" } }. EVERY LATER clip has NO image_url: the run automatically chains each clip from the PREVIOUS clip's last frame (first-frame reference), so characters, products and environments stay consistent across scenes instead of drifting — give each later clip a prompt that CONTINUES from where the previous scene ended, with its own camera and motion.
- "referenceOnly": true marks an image as an internal generation reference: it runs and later steps may reference it, but it never appears among the final results.
- The accepted storyboard is the plan's step 1 output; \${storyboard} in any later step's params is replaced with it at run time, so user edits flow into every sheet, still and clip automatically.

EVERY STEP CARRIES FINISHED CONTENT, NEVER INSTRUCTIONS:
- "voiceover" steps: params.text is the FINAL narration script written out in full — the exact words the voice will speak, in the user's language and tone. The speech model reads that text VERBATIM, so an instruction placed there gets spoken aloud.
  WRONG: { "agent": "voiceover", "params": { "text": "Generate a warm voiceover about our linen bedding" } }  ← the voice would literally say this sentence
  RIGHT: { "agent": "voiceover", "params": { "text": "Some mornings deserve to last longer. Pure linen, woven for the way you actually sleep. This is rest, redesigned." } }
- "music" steps: params.prompt is a finished style/mood/genre description ("dreamy synthwave, 100 BPM, warm analog pads, nostalgic night-drive energy"), never "make music for this".
- "image"/"video"/"i2v" steps: params.prompt is a finished cinematic visual prompt (subject, composition, lighting, camera, mood) — 15-40 words for video steps.

Respond ONLY in JSON format:
{
  "steps": [
    { "agent": "image", "task": "Hero still", "params": { "model": "<an id from the runnable image models list below>", "prompt": "...", "aspect_ratio": "16:9" }, "estimatedCredits": 5 },
    { "agent": "video", "task": "Clip 1 — opening shot", "params": { "model": "<an id from the runnable video models list below>", "prompt": "...", "duration": 5 }, "estimatedCredits": 15 },
    { "agent": "i2v", "task": "Animate the hero still", "params": { "model": "<an id from the runnable video models list below>", "image_url": "$STEP_1_OUTPUT", "prompt": "..." }, "estimatedCredits": 15 },
    { "agent": "music", "task": "Score", "params": { "model": "<an id from the runnable music models list below>", "prompt": "..." }, "estimatedCredits": 8 },
    { "agent": "voiceover", "task": "Narration", "params": { "model": "<an id from the runnable voiceover models list below>", "text": "..." }, "estimatedCredits": 5 },
    { "agent": "assembly", "task": "Join the clips into the final cut", "params": {} },
    { "agent": "export", "task": "Final launch film", "params": { "name": "Launch film" } }
  ],
  "summary": "Brief description of the plan",
  "totalCredits": 48,
  "maxCredits": 55
}

Rules:
- Reference previous step outputs as $STEP_N_OUTPUT
- Always specify a "model" for every image/video/i2v/music/voiceover step, using ONLY an exact id from the "Currently runnable models" list appended to this prompt — providers retire models constantly, so an id you recall from training data or an earlier turn may no longer exist; never guess one
- Include estimatedCredits per step and totalCredits + maxCredits for the plan
- When session defaults (appended below) name a preferred model, quality or aspect, use them unless the brief demands otherwise
- When a brand kit is provided, route through brand_guardian first
- For multi-shot video, use the storyboard agent for shot planning`,
  },
  creative_director: {
    name: "Creative Director",
    description: "Brief interpretation, concept, narrative, visual direction.",
    systemPrompt: "You are the Creative Director. Interpret the user's brief, develop a creative concept, define the narrative arc and visual direction. Output a structured creative brief with concept, mood, style references, and shot recommendations.",
  },
  image_director: {
    name: "Image Director",
    description: "Image generation strategy, reference selection, composition.",
    systemPrompt: "You are the Image Director. Choose the image generation strategy (T2I, I2I, edit, multi-ref), select references with semantic roles, define composition requirements, and structure the image prompt for the target model.",
  },
  video_director: {
    name: "Video Director",
    description: "Motion, shot duration, camera language, I2V strategy.",
    systemPrompt: "You are the Video Director. Define motion, shot duration, first/last frames, image-to-video strategy, and model-specific video prompting. Use explicit camera language and 15-40 word video prompts.",
  },
  brand_guardian: {
    name: "Brand Guardian",
    description: "Enforce brand palette, logo, typography, and tone constraints.",
    systemPrompt: "You are the Brand Guardian. Enforce brand palette, logo usage, typography, visual style, and tone of voice. Detect brand violations and recommend corrections. In locked mode, block any deviation.",
  },
  prompt_engineer: {
    name: "Prompt Engineer",
    description: "Model-specific prompt compilation, negative prompts, dialect.",
    systemPrompt: "You are the Prompt Engineer. Compile model-specific prompts using the Prompt Guide registry, craft negative prompts, protect immutable facts, and optimize for the target model's dialect.",
  },
  storyboard: {
    name: "Storyboard Agent",
    description: "Shot list, continuity, camera, pacing.",
    systemPrompt: "You are the Storyboard Agent. Create shot lists with explicit continuity tracking (character identity, outfit, environment, lighting, screen direction, previous ending frame), camera language, and pacing.",
  },
  audio_agent: {
    name: "Audio Agent",
    description: "TTS, voice, music, sound effects, timing.",
    systemPrompt: "You are the Audio Agent. Handle TTS, voice selection, music generation, sound effects, and audio timing. Choose the right model (Suno for music, ElevenLabs for narration).",
  },
  vision_analyst: {
    name: "Vision Analyst",
    description: "Scene caption, objects, OCR, palette, lighting analysis.",
    systemPrompt: "You are the Vision Analyst. Analyze images to extract captions, objects, OCR text, color palettes, lighting, and visual style. Return structured analysis for use by other agents.",
  },
  quality_control: {
    name: "Quality Control",
    description: "Prompt alignment, brand alignment, consistency checks.",
    systemPrompt: "You are the Quality Control Agent. Check prompt alignment with intent, brand alignment, reference consistency, and technical validity. Recommend targeted reruns for weak outputs.",
  },
  cost_optimizer: {
    name: "Cost Optimizer",
    description: "Model comparisons, cost/quality tradeoff.",
    systemPrompt: "You are the Cost Optimizer. Compare models on cost vs quality, suggest budget-aware alternatives, and recommend economy models when credits are insufficient.",
  },
  assembly: {
    name: "Assembly Agent",
    description: "Final sequence, media ordering, deliverables.",
    systemPrompt: "You are the Assembly Agent. Assemble the final sequence, order media correctly, join clips, and produce deliverables. Handle final export and asset saving.",
  },
  image: {
    name: "Image Agent",
    description: "Generates and edits images.",
    systemPrompt: "You are the Image Agent. Execute image generation tasks precisely using the provided model and parameters.",
  },
  video: {
    name: "Video Agent",
    description: "Generates videos from text or images.",
    systemPrompt: "You are the Video Agent. Execute video generation tasks using the provided model and parameters.",
  },
  audio: {
    name: "Audio Agent",
    description: "Generates music, voice, and sound effects.",
    systemPrompt: "You are the Audio Agent. Execute audio generation tasks using the provided model and parameters.",
  },
  website: {
    name: "Website Builder Agent",
    description: "Builds complete websites from prompts.",
    systemPrompt: `You are the Website Builder Agent. Given a user's request, generate a complete, production-ready website. Output the full HTML/CSS/JS code. Create modern, responsive, premium designs with smooth animations.`,
  },
  marketing: {
    name: "Marketing Agent",
    description: "Creates marketing campaigns, ads, and social content.",
    systemPrompt: `You are the Marketing Agent. Create compelling marketing content including ad copy, social media posts, email campaigns, and UGC video scripts. Provide ready-to-use content.`,
  },
  coding: {
    name: "Coding Agent",
    description: "Writes, debugs, and explains code.",
    systemPrompt: "You are the Coding Agent. Write clean, production-ready code. Always include explanations and follow best practices.",
  },
};

export function getAgent(type) {
  return AGENTS[type] || AGENTS.orchestrator;
}

export function getAgentList() {
  return Object.entries(AGENTS).map(([id, a]) => ({ id, name: a.name, description: a.description }));
}

// Tool agents actually execute (call a generation API or write code); every
// other AGENTS key is a persona — a system-prompt role that plans/advises
// and is executed as a single LLM completion (see executePersonaStep).
const TOOL_AGENT_KEYS = new Set(["image", "video", "audio", "website", "marketing", "coding"]);

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
async function requestLlmPlan(userMessage, context = {}) {
  const system = AGENTS.orchestrator.systemPrompt + sessionDefaultsHint(context) + (await runnableModelHint(context));
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
    { role: "system", content: AGENTS.orchestrator.systemPrompt + sessionDefaultsHint(context) + (await runnableModelHint(context)) },
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
export async function defaultRunnableModel(agentKind, { wantsVoice = false } = {}) {
  try {
    if (agentKind === "audio") {
      const rows = await getRunnableModelsForType("audio", { limit: 50 });
      const preferredKind = wantsVoice ? "tts" : "music";
      const fallbackKind = wantsVoice ? "music" : "tts";
      const generator =
        rows.find((row) => audioKind(row) === preferredKind) ||
        rows.find((row) => audioKind(row) === fallbackKind) ||
        rows[0];
      if (generator) return runnableProviderModelId(generator);
    } else {
      const [row] = await getRunnableModelsForType(agentKind, { limit: 1 });
      if (row) return runnableProviderModelId(row);
    }
  } catch { /* fall through to the last-resort id below */ }
  return LAST_RESORT_FALLBACKS[agentKind]?.[0] || agentKind;
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
export async function executeStep(step, previousOutputs = []) {
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

const GENERIC_PERSONA_PROMPT = "You are a Helmies Studio specialist agent. Complete the requested step directly, concisely, and usefully, using any context provided.";

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
  return await assembleVideos(clips, options);
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
const LAST_RESORT_FALLBACKS = {
  image: ["google/nano-banana-2-lite", "qwen-image-max"],
  video: ["wan2.6-t2v"],
  audio: ["suno-v4.5"],
};

// Steps whose output is a media URL worth logging as a Generation record
// (website/coding return code/text, not a media URL). A9: the workflow-kind
// steps the planner now emits (i2v/upscale/music/voiceover) produce media
// too — without them here their outputs got no Generation row AND their raw
// provider URLs went user-facing un-proxied.
const MEDIA_AGENT_KEYS = new Set(["image", "video", "audio", "marketing", "i2v", "upscale", "music", "voiceover"]);
const isMediaAgent = (agent) => MEDIA_AGENT_KEYS.has(normalizeAgentKey(agent));

// Confirms a LAST_RESORT_FALLBACKS id is STILL actually runnable in this
// environment's live catalog before ever treating it as a candidate.
// Without this, an id that has itself gone stale (or was never present in
// a given environment's catalog at all) would slip through anyway:
// estimateCredits' generic per-tool default (pricing-engine.js's
// getFallbackCost) happily returns SOME number for ANY model string, real
// or not, so a naive "try to quote it" check can never fail — the exact
// gap this whole fix closes for the PLANNED model must not be reopened for
// the last-resort list.
async function verifyLastResortIds(ids) {
  const verified = [];
  for (const id of ids) {
    const row = await resolveRunnableModel(id).catch(() => null);
    if (row) verified.push(id);
  }
  return verified;
}

// Picks a single runnable replacement for `excludeModel`, cheapest first —
// the live catalog first, LAST_RESORT_FALLBACKS only if that comes back
// empty (and only ids verifyLastResortIds confirms are still actually
// runnable). Re-quotes every candidate against `params` and skips anything
// that can't be quoted at all or that would exceed `ceiling` (the caller's
// budget — see executeAgentStep and executeStepWithRetry below for what
// "ceiling" means in each context). Returns `{ model, credits }` or null if
// nothing runnable/affordable exists.
async function pickSubstituteModel(agentKind, excludeModel, params, ceiling) {
  const tryIds = async (ids) => {
    for (const subId of ids) {
      if (!subId || subId === excludeModel) continue;
      let credits;
      try {
        credits = await estimateCredits(agentKind, subId, { ...params, model: subId, endpoint: subId });
      } catch {
        continue;
      }
      if (typeof ceiling === "number" && credits > ceiling) continue;
      return { model: subId, credits };
    }
    return null;
  };

  const liveCandidates = await getRunnableModelsForType(agentKind, { excludeModelIds: [excludeModel], limit: 5 }).catch(() => []);
  const found = await tryIds(liveCandidates.map(runnableProviderModelId));
  if (found) return found;
  const lastResort = await verifyLastResortIds((LAST_RESORT_FALLBACKS[agentKind] || []).filter((id) => id !== excludeModel));
  return tryIds(lastResort);
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
  if (!CATALOG_MODEL_KINDS.has(agentKind)) return [];
  const rows = await getRunnableModelsForType(agentKind, { excludeModelIds, limit }).catch(() => []);
  const ids = rows.map(runnableProviderModelId).filter(Boolean);
  if (ids.length) return ids;
  const lastResort = (LAST_RESORT_FALLBACKS[agentKind] || []).filter((id) => !excludeModelIds.includes(id));
  return verifyLastResortIds(lastResort);
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
export async function executeStepWithRetry(step, previousOutputs, attempt = 0, budget = null) {
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
      const output = await executeStep(candidate.step, previousOutputs);
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

// ── Approved-plan validation (EDITSv1 E3.2) ────────────────────────────────
// The approved plan IS the executed plan: steps come from the client
// verbatim, but every price is recomputed server-side (estimateAgentTask).
// If the server re-quote exceeds what the user approved, nothing runs and
// nothing is debited — the client must re-plan and re-approve. The debit is
// the SERVER-computed total, which is ≤ the approved total by construction,
// so "what you approved is what you pay" holds in both directions.
async function resolveApprovedPlan(precomputedPlan) {
  const steps = Array.isArray(precomputedPlan?.steps) ? precomputedPlan.steps : [];
  const approvedTotal = Number(precomputedPlan?.estimate?.total);
  if (!steps.length || !Number.isFinite(approvedTotal) || approvedTotal < 0) {
    return { error: "The approved plan is malformed — plan again and re-approve.", errorCode: "invalid_plan" };
  }
  const estimate = await estimateAgentTask(steps);
  if (estimate.total > approvedTotal) {
    return {
      error: `This plan now costs ${estimate.total} credits but ${approvedTotal} were approved. Review the plan and approve it again.`,
      errorCode: "quote_changed",
    };
  }
  return { plan: { steps, summary: precomputedPlan.summary || "Approved plan", estimate } };
}

const isHttpUrl = (v) => typeof v === "string" && /^https?:\/\//i.test(v);
const proxiedUrl = (url) => `/api/media/proxy?url=${encodeURIComponent(url)}`;

// Display form of a step output: media URLs go through the app's own proxy
// so no provider hostname is ever user-facing; text passes through. An
// export step's result object (A9) carries raw URLs inside — its deliverable
// and manifest entries are proxied the same way before anything user-facing
// sees them.
function displayOutputFor(step, output) {
  if (output && typeof output === "object" && output.kind === "export") {
    return {
      ...output,
      url: isHttpUrl(output.url) ? proxiedUrl(output.url) : output.url,
      manifest: Array.isArray(output.manifest)
        ? output.manifest.map((entry) => (isHttpUrl(entry?.url) ? { ...entry, url: proxiedUrl(entry.url) } : entry))
        : output.manifest,
    };
  }
  if (isMediaAgent(step.agent) && isHttpUrl(output)) return proxiedUrl(output);
  return output;
}

// Best-effort session history write — a failed append must never fail a run.
async function persistSessionMessage(sessionId, kind, payload) {
  if (!sessionId) return;
  try {
    await appendMessage(sessionId, { role: "assistant", kind, content: JSON.stringify(payload) });
  } catch { /* history is best-effort */ }
}

// Shared preflight for both run executors: abuse check, plan resolution
// (approved plan honored verbatim, or the planner for the legacy message
// path), AgentRun row, wallet check, and the single up-front debit of the
// server-computed estimate total (the run's spending ceiling).
export async function prepareAgentRun(userId, userMessage, context, options) {
  const { precomputedPlan = context?.precomputedPlan || null, sessionId = null } = options || {};

  const abuse = await detectAbuse(userId);
  if (abuse.flagged) {
    return { error: `Request blocked: ${abuse.reason}`, errorCode: "blocked" };
  }

  let plan;
  if (precomputedPlan) {
    const resolved = await resolveApprovedPlan(precomputedPlan);
    if (resolved.error) return resolved;
    plan = resolved.plan;
  } else {
    plan = await planTask(userMessage, context);
  }

  const agentRun = await prisma.agentRun.create({
    data: {
      userId,
      agentType: "orchestrator",
      task: userMessage || plan.summary || "Agent run",
      status: "executing",
      creditsEstimated: plan.estimate?.total || 0,
      steps: plan.steps,
      sessionId,
    },
  });

  const wallet = await getWallet(userId);
  if (wallet.available < plan.estimate.total) {
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: "failed", error: "Insufficient credits" },
    });
    return { error: "Insufficient credits", errorCode: "insufficient_credits", creditsNeeded: plan.estimate.total, creditsAvailable: wallet.available };
  }

  await debitWallet(userId, plan.estimate.total, `Agent run: ${plan.summary}`, `agent:${agentRun.id}`);

  return { plan, agentRun, sessionId };
}

// The step loop both executors share. Money invariant: `debitedTotal` (the
// server-computed estimate, already debited) is the ceiling — each step gets
// a budget of what's left after the actual spend so far and the remaining
// steps' quotes, so no fallback swap can push the run past what was
// approved. Unused budget (cheaper fallbacks, failed later steps) is
// refunded at the end; a hard failure refunds everything not actually spent.
export async function executePlannedRun(userId, agentRun, plan, sessionId, emit) {
  const debitedTotal = plan.estimate.total;
  const breakdown = plan.estimate.breakdown || [];
  const outputs = [];        // raw outputs — $STEP_N_OUTPUT chaining needs provider-fetchable URLs
  const displayOutputs = []; // proxied media URLs / text — everything user-facing
  const stepResults = [];
  let actualUsed = 0;
  let anyStepFailed = false;

  try {
    for (let i = 0; i < plan.steps.length; i++) {
      let step = plan.steps[i];
      const quoted = breakdown[i]?.credits ?? 0;
      const remainingQuoted = breakdown.slice(i + 1).reduce((a, b) => a + (b?.credits || 0), 0);
      const budget = { quoted, max: debitedTotal - actualUsed - remainingQuoted };

      // Last-frame chaining (2026-08-06): a video step with no reference of
      // its own inherits the PREVIOUS clip's last frame as its first-frame
      // reference, so characters, products and environments stay consistent
      // across scenes instead of drifting (owner defect: every scene of a
      // bedsheet ad looked different). Best-effort — extraction failure
      // degrades to running the step as planned.
      if (["video", "i2v"].includes(normalizeAgentKey(step.agent))) {
        step = await chainStepIfNeeded(step, outputs);
      }

      emit?.({ type: "step_start", step: i + 1, agent: step.agent, task: step.task });

      try {
        const { output, credits } = await executeStepWithRetry(step, outputs, 0, budget);
        const stepCredits = typeof credits === "number" ? credits : quoted;
        actualUsed += stepCredits;
        outputs.push(output);
        const displayOutput = displayOutputFor(step, output);
        // The storyboard JSON and reference-only media (scene stills,
        // character sheets — the images the clips are generated FROM, not
        // the deliverables) stay in `outputs` for $STEP chaining and
        // ${storyboard} resolution, but never leak into the user-facing
        // outputs grid. The step list still shows they ran.
        const isStoryboard = normalizeAgentKey(step.agent) === "storyboard";
        displayOutputs.push(isStoryboard || step.params?.referenceOnly ? null : displayOutput);
        stepResults.push({
          step: i + 1, agent: step.agent, status: "completed",
          output: isStoryboard ? displayOutput : (typeof displayOutput === "string" ? displayOutput.slice(0, 500) : displayOutput),
          retried: false,
        });

        if (isMediaAgent(step.agent)) {
          await prisma.generation.create({
            data: {
              userId,
              tool: step.agent,
              model: step.params?.model || step.agent,
              prompt: step.params?.prompt || step.task || "",
              params: step.params,
              outputUrl: isHttpUrl(output) ? proxiedUrl(output) : null,
              status: "completed",
              creditsUsed: stepCredits,
            },
          });
        }

        emit?.({ type: "step_complete", step: i + 1, agent: step.agent, status: "completed", output: typeof displayOutput === "string" ? displayOutput : null, creditsUsed: stepCredits });
      } catch (stepError) {
        anyStepFailed = true;
        const friendly = brandForUser(stepError.message);
        stepResults.push({ step: i + 1, agent: step.agent, status: "failed", error: friendly });
        emit?.({ type: "step_complete", step: i + 1, agent: step.agent, status: "failed", error: friendly });
        if (i === 0) throw stepError;
        outputs.push(null);        // keep $STEP_N_OUTPUT indexes aligned
        displayOutputs.push(null);
      }

      // Live progress for background runs: persist the step list after each
      // step so the status poll (GET /api/agent/run/:id) can render
      // per-step progress while the run is still executing — the client may
      // have closed the tab and come back mid-run. The final update below
      // overwrites this with the complete result (outputs + assembled).
      await prisma.agentRun.update({
        where: { id: agentRun.id },
        data: { result: { stepResults: stepResults.slice(), summary: plan.summary } },
      }).catch(() => {});
    }

    const assembled = assembleOutputs(displayOutputs, plan.steps);
    const refund = debitedTotal - actualUsed;
    if (refund > 0) {
      await refundCredits(userId, refund, `agent:${agentRun.id}`, anyStepFailed ? "Agent run partial failure" : "Agent run unused budget");
    }
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: "completed", creditsUsed: actualUsed, result: { outputs: displayOutputs, stepResults, summary: plan.summary, assembled } },
    });
    await persistSessionMessage(sessionId, "run", { runId: agentRun.id, status: "done", summary: plan.summary, creditsUsed: actualUsed, stepResults });
    await persistSessionMessage(sessionId, "outputs", { runId: agentRun.id, assembled, outputs: displayOutputs.filter((o) => typeof o === "string") });
    return { success: true, outputs: displayOutputs, stepResults, assembled, summary: plan.summary, creditsUsed: actualUsed };
  } catch (error) {
    const refund = debitedTotal - actualUsed;
    if (refund > 0) {
      await refundCredits(userId, refund, `agent:${agentRun.id}`, "Agent run partial failure");
    }
    const friendly = brandForUser(error.message);
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: "failed", error: friendly, creditsUsed: actualUsed, result: { stepResults } },
    });
    await persistSessionMessage(sessionId, "run", { runId: agentRun.id, status: "failed", error: friendly, creditsUsed: actualUsed, stepResults });
    return { success: false, error: friendly, stepResults, creditsUsed: actualUsed };
  }
}

// ── Execute full agent run with SSE streaming ──
// (prepareAgentRun/executePlannedRun below are also exported — the
// background path uses them detached, and the status route reads the
// AgentRun row they write.)
// options: { precomputedPlan, sessionId } — when precomputedPlan is present
// it IS the executed plan (the planner is never re-run; see
// resolveApprovedPlan above for the money contract).
export async function executeAgentRunStream(userId, userMessage, context = {}, options = {}) {
  const prep = await prepareAgentRun(userId, userMessage, context, options);
  if (prep.error) return { stream: null, ...prep };

  const { plan, agentRun, sessionId } = prep;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // A client that closed the tab must never kill the run: enqueue throws
      // once the stream is gone, so every emit is guarded — the production
      // itself (executePlannedRun) keeps running to completion server-side,
      // writing its Generation rows (which land in the gallery) and
      // persisting the run to the session (which renders on resume).
      const emit = (payload) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)); } catch { /* client gone — keep running */ }
      };
      try {
        const result = await executePlannedRun(userId, agentRun, plan, sessionId, emit);
        emit({ type: "run_complete", ...result });
      } catch (error) {
        // executePlannedRun handles its own failures; this only catches a
        // catastrophic emit/stream fault.
        try { emit({ type: "run_complete", success: false, error: brandForUser(error.message) }); } catch { /* stream gone */ }
      }
      try { controller.close(); } catch { /* stream gone */ }
    },
  });

  return { stream, plan };
}

/* ── Background agent run (2026-08-06) ──────────────────────────────────────
   The browser must be able to close and the run still finish: the queue is
   the app process itself (PM2 keeps it alive), the run is detached from any
   request. prepareAgentRun debits the approved total up front (the same
   money contract as the streaming path), then executePlannedRun runs
   detached — writing each media step's Generation row (which lands in the
   gallery), persisting the run to the session feed, and refunding unused
   budget. Returns { queued, runId } immediately so the client can poll
   GET /api/agent/run/:id for progress. */
export async function executeAgentRunBackground(userId, userMessage, context = {}, options = {}) {
  const prep = await prepareAgentRun(userId, userMessage, context, options);
  if (prep.error) return { success: false, ...prep };

  const { plan, agentRun, sessionId } = prep;
  const runId = agentRun.id;
  // Detached — never awaited by the request handler. Errors are handled
  // inside executePlannedRun (refund + agentRun row + session message);
  // this last-resort catch only logs a runaway so it is never silent.
  executePlannedRun(userId, agentRun, plan, sessionId, null).catch((err) => {
    try { log.error("agent_background_run_crashed", { runId, err: err?.message }); } catch { /* logging must not mask */ }
  });
  return { queued: true, runId };
}

export async function executeAgentRun(userId, userMessage, context = {}, options = {}) {
  const prep = await prepareAgentRun(userId, userMessage, context, options);
  if (prep.error) return { success: false, ...prep };
  return executePlannedRun(userId, prep.agentRun, prep.plan, prep.sessionId, null);
}

// ── Execute exactly ONE plan step (EDITSv1 E3.2, /api/agent/step) ─────────
// Powers per-asset Accept/Regenerate/Edit: debits exactly the step's
// server-computed quote (re-quoted when the model/prompt is overridden),
// executes with fallbacks capped at that same quote (a pricier fallback
// fails the step rather than overspending), writes the Generation row for
// media steps, and refunds the full quote if the step fails.
export async function executeAgentStep(userId, {
  plan,
  stepIndex,
  regenerate = false,
  paramOverrides = null,
  previousOutputs = [],
  sessionId = null,
} = {}) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const index = Number(stepIndex);
  if (!steps.length || !Number.isInteger(index) || index < 0 || index >= steps.length) {
    const err = new Error("Step index out of range for this plan.");
    err.code = "invalid_plan";
    throw err;
  }

  const abuse = await detectAbuse(userId);
  if (abuse.flagged) {
    const err = new Error(`Request blocked: ${abuse.reason}`);
    err.code = "blocked";
    throw err;
  }

  const base = steps[index];
  const step = { ...base, params: { ...(base.params || {}) } };
  if (paramOverrides && typeof paramOverrides === "object") {
    if (typeof paramOverrides.model === "string" && paramOverrides.model.trim()) {
      const model = paramOverrides.model.trim();
      step.params.model = model;
      step.params.endpoint = model;
      delete step.params._provider; // re-resolve the provider for the new model
    }
    if (typeof paramOverrides.prompt === "string" && paramOverrides.prompt.trim()) {
      step.params.prompt = paramOverrides.prompt;
    }
  }

  const tool = normalizeAgentKey(step.agent);
  const model = step.params?.model || step.params?._modelId || tool;
  // Server-side re-quote, including any overrides — never the client's number.
  let quoted = await estimateCredits(tool, model, step.params || {});

  // ── URGENT production fix: never debit for a model that cannot run ──────
  // estimateCredits above happily quotes a price for a model whose
  // ModelPricing row is inactive/deprecated (production incident: flux-dev
  // — isActive:false, isDeprecated:true — still got quoted and debited
  // before its execution 500'd). Resolve runnability BEFORE the debit
  // below: an unrunnable model is swapped for the cheapest runnable model
  // of the same kind and RE-QUOTED, capped at `quoted` (the original
  // model's own would-be cost — this step's approved budget ceiling, same
  // EDITSv1 E3.2 invariant executeStepWithRetry's fallback budget already
  // enforces), or the step fails cleanly with zero debit if no runnable
  // substitute exists at all within that ceiling.
  if (CATALOG_MODEL_KINDS.has(tool)) {
    const runnableRow = await resolveRunnableModel(model).catch(() => null);
    if (!runnableRow) {
      const sub = await pickSubstituteModel(tool, model, step.params, quoted);
      if (!sub) {
        const err = new Error(`"${model}" is no longer available for ${tool} generation, and no runnable replacement fits this step's approved budget of ${quoted} credit${quoted === 1 ? "" : "s"}. Please re-plan this step.`);
        err.code = "model_unavailable";
        throw err;
      }
      step.params.model = sub.model;
      step.params.endpoint = sub.model;
      delete step.params._provider; // re-resolve the provider for the substituted model
      quoted = sub.credits;
    }
  }

  const wallet = await getWallet(userId);
  if (wallet.available < quoted) {
    const err = new Error("Insufficient credits");
    err.code = "insufficient_credits";
    err.creditsNeeded = quoted;
    err.creditsAvailable = wallet.available;
    throw err;
  }

  const agentRun = await prisma.agentRun.create({
    data: {
      userId,
      agentType: tool || "orchestrator",
      task: step.task || step.params?.prompt || "Agent step",
      status: "executing",
      creditsEstimated: quoted,
      steps: [step],
      sessionId,
    },
  });

  await debitWallet(userId, quoted, `Agent step ${index + 1}: ${step.task || tool}`, `agent:${agentRun.id}`);

  try {
    const cleanPrevious = Array.isArray(previousOutputs) ? previousOutputs : [];
    // Same last-frame chaining as the run loop: a reference-less video step
    // inherits the newest previous clip's last frame as its first-frame
    // reference (best-effort).
    const chainedStep = await chainStepIfNeeded(step, cleanPrevious);
    const { output } = await executeStepWithRetry(chainedStep, cleanPrevious, 0, { quoted, max: quoted });
    const displayOutput = displayOutputFor(step, output);

    let generationId = null;
    if (isMediaAgent(step.agent)) {
      const generation = await prisma.generation.create({
        data: {
          userId,
          tool,
          model: step.params?.model || tool,
          prompt: step.params?.prompt || step.task || "",
          params: step.params,
          outputUrl: isHttpUrl(output) ? proxiedUrl(output) : null,
          status: "completed",
          creditsUsed: quoted,
        },
      });
      generationId = generation.id;
    }

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: "completed",
        creditsUsed: quoted,
        result: { outputs: [displayOutput], stepResults: [{ step: index + 1, agent: step.agent, status: "completed", output: typeof displayOutput === "string" ? displayOutput.slice(0, 500) : displayOutput }] },
      },
    });

    const assembled = assembleOutputs([displayOutput], [step]);
    await persistSessionMessage(sessionId, "run", {
      runId: agentRun.id,
      stepIndex: index,
      agent: step.agent,
      task: step.task,
      status: "completed",
      output: typeof displayOutput === "string" ? displayOutput : null,
      creditsUsed: quoted,
      model: step.params?.model || null,
      regenerate: !!regenerate,
    });

    return { output: displayOutput, rawOutput: output, creditsUsed: quoted, assembled, generationId, runId: agentRun.id };
  } catch (error) {
    // A failed step costs nothing — the full quote comes back.
    await refundCredits(userId, quoted, `agent:${agentRun.id}`, "Agent step failed");
    const friendly = brandForUser(error.message);
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: "failed", error: friendly },
    });
    await persistSessionMessage(sessionId, "run", {
      runId: agentRun.id,
      stepIndex: index,
      agent: step.agent,
      task: step.task,
      status: "failed",
      error: friendly,
      creditsUsed: 0,
      regenerate: !!regenerate,
    });
    throw error;
  }
}

// ── Assemble outputs into a coherent package ──
// A9: `deliverable` names THE final product (owner defect 5) — the export
// step's own result when one ran, else the assembled cut (the newest video)
// when an assembly step produced one. The client renders it prominently
// with the collected assets beneath.
export function assembleOutputs(outputs, steps) {
  const images = [];
  const videos = [];
  const audio = [];
  const text = [];
  let deliverable = null;

  outputs.forEach((output, i) => {
    if (!output) return; // storyboard steps leave a null display output by design
    if (output && typeof output === "object" && output.kind === "export") {
      if (typeof output.url === "string" && output.url) {
        deliverable = { url: output.url, name: output.name || "Deliverable" };
      }
      return; // never dump the export manifest into the text bucket
    }
    if (!output || typeof output !== "string") {
      text.push({ step: i + 1, agent: steps[i]?.agent, content: typeof output === "string" ? output : JSON.stringify(output)?.slice(0, 500) });
      return;
    }
    if (output.match(/\.(jpg|jpeg|png|webp|gif)$/i) || (output.includes("cloudfront") && !output.match(/\.(mp4|webm)$/i))) {
      images.push({ step: i + 1, url: output });
    } else if (output.match(/\.(mp4|webm|mov)$/i)) {
      videos.push({ step: i + 1, url: output });
    } else if (output.match(/\.(mp3|wav|ogg|flac)$/i)) {
      audio.push({ step: i + 1, url: output });
    } else {
      text.push({ step: i + 1, content: output.slice(0, 2000) });
    }
  });

  // No export step ran, but an assembly joined clips — the assembled cut
  // (by construction the newest video) IS the deliverable.
  if (!deliverable && videos.length && Array.isArray(steps) && steps.some((s) => normalizeAgentKey(s?.agent) === "assembly")) {
    deliverable = { url: videos[videos.length - 1].url, name: "Assembled video" };
  }

  return { images, videos, audio, text, deliverable, total: outputs.length };
}