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

Respond ONLY in JSON format:
{
  "steps": [
    { "agent": "image", "task": "Generate a hero image of...", "params": { "model": "flux-dev", "prompt": "...", "aspect_ratio": "16:9" }, "estimatedCredits": 5 },
    { "agent": "video", "task": "Animate the hero image", "params": { "model": "kling-v2.1-i2v", "image_url": "$STEP_1_OUTPUT", "prompt": "..." }, "estimatedCredits": 15 }
  ],
  "summary": "Brief description of the plan",
  "totalCredits": 20,
  "maxCredits": 25
}

Rules:
- Reference previous step outputs as $STEP_N_OUTPUT
- Always specify the model for each step
- Include estimatedCredits per step and totalCredits + maxCredits for the plan
- Keep steps minimal and efficient
- If the user asks for something simple, use a single step
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

// ── Plan a task with token-by-token streaming ──
export async function planTaskStream(userMessage, context = {}) {
  const hasLLM = process.env.OPENROUTER_KEY;

  if (!hasLLM) {
    const plan = buildHeuristicPlan(userMessage, context);
    const estimate = await estimateAgentTask(plan.steps || []);
    return { stream: null, plan: { ...plan, estimate } };
  }

  const messages = [
    { role: "system", content: AGENTS.orchestrator.systemPrompt },
    { role: "user", content: `Context: ${JSON.stringify(context)}\n\nRequest: ${userMessage}` },
  ];

  let llmReadable;
  try {
    llmReadable = await llmStream(messages, { maxTokens: 2000, temperature: 0.3 });
  } catch {
    const plan = buildHeuristicPlan(userMessage, context);
    const estimate = await estimateAgentTask(plan.steps || []);
    return { stream: null, plan: { ...plan, estimate } };
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
        const cleaned = buffer.replace(/```json\n?/g, "").replace(/```/g, "").trim();
        let plan;
        try {
          const json = JSON.parse(cleaned);
          const estimate = await estimateAgentTask(json.steps || []);
          plan = { ...json, estimate };
        } catch {
          plan = buildHeuristicPlan(userMessage, context);
          const estimate = await estimateAgentTask(plan.steps || []);
          plan = { ...plan, estimate };
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "plan", plan })}\n\n`));
      } catch {
        const fallback = buildHeuristicPlan(userMessage, context);
        const estimate = await estimateAgentTask(fallback.steps || []);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "plan", plan: { ...fallback, estimate } })}\n\n`));
      }
      controller.close();
    },
  });

  return { stream, plan: null };
}

// ── Plan a task (orchestrator) ──
export async function planTask(userMessage, context = {}) {
  const hasLLM = process.env.OPENROUTER_KEY;

  if (!hasLLM) {
    const plan = buildHeuristicPlan(userMessage, context);
    const estimate = await estimateAgentTask(plan.steps || []);
    return { ...plan, estimate };
  }

  const messages = [
    { role: "system", content: AGENTS.orchestrator.systemPrompt },
    { role: "user", content: `Context: ${JSON.stringify(context)}\n\nRequest: ${userMessage}` },
  ];

  try {
    const response = await llmComplete(messages, { maxTokens: 2000, temperature: 0.3 });
    const json = JSON.parse(response.replace(/```json\n?/g, "").replace(/```/g, "").trim());
    const estimate = await estimateAgentTask(json.steps || []);
    return { ...json, estimate };
  } catch {
    const plan = buildHeuristicPlan(userMessage, context);
    const estimate = await estimateAgentTask(plan.steps || []);
    return { ...plan, estimate };
  }
}

// ── Heuristic plan when no LLM available ──
function buildHeuristicPlan(userMessage, context = {}) {
  const lower = userMessage.toLowerCase();
  const steps = [];

  const hasVideo = lower.match(/video|animate|motion|clip|movie|film/);
  const hasAudio = lower.match(/audio|music|voice|sound|song|singing/);
  const hasWebsite = lower.match(/website|landing page|web page|html|site/);
  const hasMarketing = lower.match(/marketing|ad|campaign|social|ugc|brand/);
  const hasCode = lower.match(/code|function|component|api|script|debug/);

  if (hasWebsite) {
    steps.push({ agent: "website", task: userMessage, params: { prompt: userMessage } });
  } else if (hasCode) {
    steps.push({ agent: "coding", task: userMessage, params: { prompt: userMessage } });
  } else if (hasMarketing) {
    steps.push({ agent: "marketing", task: userMessage, params: { prompt: userMessage } });
  } else if (hasAudio) {
    steps.push({ agent: "audio", task: userMessage, params: { _modelId: "suno-v4.5", endpoint: "suno-v4.5", prompt: userMessage, duration: 30 } });
  } else {
    steps.push({ agent: "image", task: userMessage, params: { model: "flux-dev", endpoint: "flux-dev-image", prompt: userMessage, aspect_ratio: "1:1" } });
    if (hasVideo) {
      steps.push({ agent: "video", task: "Animate the generated image", params: { model: "kling-v2.1-i2v", endpoint: "kling-v2.1-i2v", image_url: "$STEP_1_OUTPUT", prompt: userMessage, duration: 5 } });
    }
  }

  return { steps, summary: `Heuristic plan: ${steps.length} step(s)` };
}

// ── Execute a single step ──
export async function executeStep(step, previousOutputs = []) {
  const { agent, params } = step;

  let resolvedParams = { ...params };
  for (const [key, value] of Object.entries(resolvedParams)) {
    if (typeof value === "string" && value.startsWith("$STEP_")) {
      const stepNum = parseInt(value.match(/\d+/)?.[0]) - 1;
      if (previousOutputs[stepNum]) resolvedParams[key] = previousOutputs[stepNum];
    }
  }

  const normalized = normalizeAgentKey(agent);

  switch (normalized) {
    case "image":
      return await executeImageStep(resolvedParams);
    case "video":
      return await executeVideoStep(resolvedParams);
    case "audio":
      return await executeAudioStep(resolvedParams);
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

async function executeAudioStep(params) {
  const endpoint = params.endpoint || params._modelId || params.model;
  const provider = await resolveProvider(params._modelId || params.model || endpoint);
  const result = await generateAudio({ endpoint, ...params, _provider: provider });
  return result.url || result.outputs?.[0];
}

// ── Fallback models per agent type (model + provider pairs) ──
const FALLBACKS = {
  image: [
    { model: "flux-dev", provider: "kie" },
    { model: "nano-banana", provider: "kie" },
    { model: "qwen-image", provider: "alibaba" },
  ],
  video: [
    { model: "wan-2.6-t2v", provider: "kie" },
    { model: "hailuo-02-standard", provider: "kie" },
    { model: "wan-2.6-t2v", provider: "alibaba" },
  ],
  audio: [
    { model: "suno-v4", provider: "kie" },
    { model: "suno-v4.5", provider: "kie" },
  ],
};

// Steps whose output is a media URL worth logging as a Generation record
// (website/coding return code/text, not a media URL).
const MEDIA_AGENT_KEYS = new Set(["image", "video", "audio", "marketing"]);
const isMediaAgent = (agent) => MEDIA_AGENT_KEYS.has(normalizeAgentKey(agent));

// ── Retry with fallback model + provider (budget-aware, EDITSv1 E3.2) ──
// Returns { output, credits, model }. `budget` is { quoted, max }:
//   - quoted: the server-computed credits for the step's PLANNED model —
//     what a successful un-swapped execution costs.
//   - max: the most this step may cost without pushing the run's total
//     debits above what the user approved. A fallback model swap re-quotes
//     server-side; a fallback whose re-quote exceeds `max` is skipped, and
//     if no affordable fallback succeeds, the step FAILS with the original
//     error. Failing is always preferred to overspending.
export async function executeStepWithRetry(step, previousOutputs, attempt = 0, budget = null) {
  const agentKind = normalizeAgentKey(step.agent);
  const fallbacks = FALLBACKS[agentKind] || [];

  // Candidate list: the step as planned, then each fallback swap.
  const candidates = [{ step, credits: budget && typeof budget.quoted === "number" ? budget.quoted : null }];
  for (const fb of fallbacks) {
    candidates.push({
      step: { ...step, params: { ...step.params, model: fb.model, endpoint: fb.model, _provider: fb.provider } },
      fallbackModel: fb.model,
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
// so no provider hostname is ever user-facing; text passes through.
function displayOutputFor(step, output) {
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
async function prepareAgentRun(userId, userMessage, context, options) {
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
async function executePlannedRun(userId, agentRun, plan, sessionId, emit) {
  const debitedTotal = plan.estimate.total;
  const breakdown = plan.estimate.breakdown || [];
  const outputs = [];        // raw outputs — $STEP_N_OUTPUT chaining needs provider-fetchable URLs
  const displayOutputs = []; // proxied media URLs / text — everything user-facing
  const stepResults = [];
  let actualUsed = 0;
  let anyStepFailed = false;

  try {
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      const quoted = breakdown[i]?.credits ?? 0;
      const remainingQuoted = breakdown.slice(i + 1).reduce((a, b) => a + (b?.credits || 0), 0);
      const budget = { quoted, max: debitedTotal - actualUsed - remainingQuoted };

      emit?.({ type: "step_start", step: i + 1, agent: step.agent, task: step.task });

      try {
        const { output, credits } = await executeStepWithRetry(step, outputs, 0, budget);
        const stepCredits = typeof credits === "number" ? credits : quoted;
        actualUsed += stepCredits;
        outputs.push(output);
        const displayOutput = displayOutputFor(step, output);
        displayOutputs.push(displayOutput);
        stepResults.push({ step: i + 1, agent: step.agent, status: "completed", output: typeof displayOutput === "string" ? displayOutput.slice(0, 500) : displayOutput, retried: false });

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
      const emit = (payload) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      try {
        const result = await executePlannedRun(userId, agentRun, plan, sessionId, emit);
        emit({ type: "run_complete", ...result });
      } catch (error) {
        // executePlannedRun handles its own failures; this only catches a
        // catastrophic emit/stream fault.
        try { emit({ type: "run_complete", success: false, error: brandForUser(error.message) }); } catch { /* stream gone */ }
      }
      controller.close();
    },
  });

  return { stream, plan };
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
  const quoted = await estimateCredits(tool, model, step.params || {});

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
    const { output } = await executeStepWithRetry(step, cleanPrevious, 0, { quoted, max: quoted });
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
export function assembleOutputs(outputs, steps) {
  const images = [];
  const videos = [];
  const audio = [];
  const text = [];

  outputs.forEach((output, i) => {
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

  return { images, videos, audio, text, total: outputs.length };
}