import { llmComplete, llmStream, resolveProvider } from "@/lib/providers";
import { estimateCredits, estimateAgentTask } from "@/lib/pricing-engine";
import {
  generateImage, generateI2I, generateVideo, generateI2V,
  processLipSync, generateAudio, processRecast,
  runClipping, runMotionGraphics, generateMarketingAd,
} from "@/lib/generation";
import { detectAbuse } from "@/lib/security";
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

// ── Plan a task with token-by-token streaming ──
export async function planTaskStream(userMessage, context = {}) {
  const hasLLM = process.env.KIE_KEY;

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
  const hasLLM = process.env.KIE_KEY;

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

  switch (agent) {
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
    default:
      throw new Error(`Unknown agent: ${agent}`);
  }
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

// ── Retry with fallback model + provider ──
async function executeStepWithRetry(step, previousOutputs, attempt = 0) {
  try {
    return await executeStep(step, previousOutputs);
  } catch (error) {
    const fallbacks = FALLBACKS[step.agent] || [];
    if (attempt >= fallbacks.length || !fallbacks[attempt]) throw error;

    const fb = fallbacks[attempt];
    const retryStep = {
      ...step,
      params: { ...step.params, model: fb.model, endpoint: fb.model, _provider: fb.provider },
    };
    return executeStepWithRetry(retryStep, previousOutputs, attempt + 1);
  }
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

// ── Execute full agent run with SSE streaming ──
export async function executeAgentRunStream(userId, userMessage, context = {}) {
  const abuse = await detectAbuse(userId);
  if (abuse.flagged) {
    return { stream: null, error: `Request blocked: ${abuse.reason}` };
  }

  const plan = await planTask(userMessage, context);

  const agentRun = await prisma.agentRun.create({
    data: {
      userId,
      agentType: "orchestrator",
      task: userMessage,
      status: "executing",
      creditsEstimated: plan.estimate?.total || 0,
      steps: plan.steps,
    },
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  // Wallet is the source of truth; sync the legacy column.
  const { getWallet } = await import("@/lib/wallet");
  const wallet = await getWallet(userId);
  const availableCredits = wallet.available;
  if (availableCredits < plan.estimate.total) {
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: "failed", error: "Insufficient credits" },
    });
    return { stream: null, error: "Insufficient credits", creditsNeeded: plan.estimate.total, creditsAvailable: availableCredits };
  }

  await debitCredits(userId, plan.estimate.total, `Agent run: ${plan.summary}`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const outputs = [];
      const stepResults = [];
      let totalCreditsUsed = plan.estimate.total;

      try {
        for (let i = 0; i < plan.steps.length; i++) {
          const step = plan.steps[i];
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "step_start", step: i + 1, agent: step.agent, task: step.task })}\n\n`));

          try {
            const output = await executeStepWithRetry(step, outputs, 0);
            outputs.push(output);
            const stepResult = { step: i + 1, agent: step.agent, status: "completed", output: typeof output === "string" ? output.slice(0, 500) : output, retried: false };
            stepResults.push(stepResult);

            if (step.agent === "image" || step.agent === "video" || step.agent === "audio" || step.agent === "marketing") {
              const proxiedOutput = typeof output === "string" ? `/api/media/proxy?url=${encodeURIComponent(output)}` : null;
              await prisma.generation.create({
                data: { userId, tool: step.agent, model: step.params?.model || step.agent, prompt: step.params?.prompt || step.task || "", params: step.params, outputUrl: proxiedOutput, status: "completed", creditsUsed: plan.estimate.breakdown[i]?.credits || 0 },
              });
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "step_complete", step: i + 1, agent: step.agent, status: "completed", output: typeof output === "string" ? output : null, creditsUsed: plan.estimate.breakdown[i]?.credits || 0 })}\n\n`));
          } catch (stepError) {
            stepResults.push({ step: i + 1, agent: step.agent, status: "failed", error: stepError.message });
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "step_complete", step: i + 1, agent: step.agent, status: "failed", error: stepError.message })}\n\n`));
            if (i === 0) throw stepError;
          }
        }

        const assembled = assembleOutputs(outputs, plan.steps);
        await prisma.agentRun.update({ where: { id: agentRun.id }, data: { status: "completed", creditsUsed: totalCreditsUsed, result: { outputs, stepResults, summary: plan.summary, assembled } } });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "run_complete", success: true, outputs, stepResults, assembled, summary: plan.summary, creditsUsed: totalCreditsUsed })}\n\n`));
      } catch (error) {
        const refundAmount = plan.estimate.total - (stepResults.filter(s => s.status === "completed").length * (plan.estimate.total / plan.steps.length));
        await creditUser(userId, Math.ceil(refundAmount), "agent_refund", `Refund for failed agent run`);
        await prisma.agentRun.update({ where: { id: agentRun.id }, data: { status: "failed", error: error.message, result: { stepResults } } });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "run_complete", success: false, error: error.message, stepResults })}\n\n`));
      }
      controller.close();
    },
  });

  return { stream, plan };
}
export async function executeAgentRun(userId, userMessage, context = {}) {
  const abuse = await detectAbuse(userId);
  if (abuse.flagged) {
    return { success: false, error: `Request blocked: ${abuse.reason}` };
  }

  const plan = await planTask(userMessage, context);

  const agentRun = await prisma.agentRun.create({
    data: {
      userId,
      agentType: "orchestrator",
      task: userMessage,
      status: "executing",
      creditsEstimated: plan.estimate?.total || 0,
      steps: plan.steps,
    },
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  const { getWallet } = await import("@/lib/wallet");
  const wallet = await getWallet(userId);
  if (wallet.available < plan.estimate.total) {
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: "failed", error: "Insufficient credits" },
    });
    return { success: false, error: "Insufficient credits", creditsNeeded: plan.estimate.total, creditsAvailable: wallet.available };
  }

  await debitCredits(userId, plan.estimate.total, `Agent run: ${plan.summary}`);

  const outputs = [];
  const stepResults = [];

  try {
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      try {
        const output = await executeStepWithRetry(step, outputs, 0);
        outputs.push(output);
        stepResults.push({ step: i + 1, agent: step.agent, status: "completed", output: typeof output === "string" ? output.slice(0, 500) : output, retried: false });

        if (step.agent === "image" || step.agent === "video" || step.agent === "audio" || step.agent === "marketing") {
          const proxiedOutput = typeof output === "string" ? `/api/media/proxy?url=${encodeURIComponent(output)}` : null;
          await prisma.generation.create({
            data: {
              userId,
              tool: step.agent,
              model: step.params?.model || step.agent,
              prompt: step.params?.prompt || step.task || "",
              params: step.params,
              outputUrl: proxiedOutput,
              status: "completed",
              creditsUsed: plan.estimate.breakdown[i]?.credits || 0,
            },
          });
        }
      } catch (stepError) {
        stepResults.push({ step: i + 1, agent: step.agent, status: "failed", error: stepError.message });
        if (i === 0) throw stepError;
      }
    }

    // ── Assemble outputs into a package ──
    const assembled = assembleOutputs(outputs, plan.steps);

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: "completed",
        creditsUsed: plan.estimate.total,
        result: { outputs, stepResults, summary: plan.summary, assembled },
      },
    });

    return { success: true, outputs, stepResults, assembled, summary: plan.summary, creditsUsed: plan.estimate.total };
  } catch (error) {
    const refundAmount = plan.estimate.total - (stepResults.filter(s => s.status === "completed").length * (plan.estimate.total / plan.steps.length));
    await creditUser(userId, Math.ceil(refundAmount), "agent_refund", `Refund for failed agent run`);
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: "failed", error: error.message, result: { stepResults } },
    });
    return { success: false, error: error.message, stepResults };
  }
}

async function debitCredits(userId, amount, description) {
  const result = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: amount } },
    data: { credits: { decrement: amount } },
  });
  if (result.count === 0) throw new Error("Insufficient credits");
  await prisma.creditTransaction.create({ data: { userId, amount: -amount, type: "agent_run", description } });
}

async function creditUser(userId, amount, type, description) {
  await prisma.user.update({ where: { id: userId }, data: { credits: { increment: amount } } });
  await prisma.creditTransaction.create({ data: { userId, amount, type, description } });
}

// ── Assemble outputs into a coherent package ──
function assembleOutputs(outputs, steps) {
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