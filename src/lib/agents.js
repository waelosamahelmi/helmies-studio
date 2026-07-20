import { llmComplete } from "@/lib/providers";
import { estimateCredits, estimateAgentTask } from "@/lib/pricing-engine";
import {
  generateImage, generateI2I, generateVideo, generateI2V,
  processLipSync, generateAudio, processRecast,
  runClipping, runMotionGraphics, generateMarketingAd,
} from "@/lib/muapi";
import prisma from "@/lib/prisma";

// ── Agent definitions ──
const AGENTS = {
  orchestrator: {
    name: "Orchestrator",
    description: "Main coordinator. Estimates credits, routes tasks, retries failures, assembles outputs.",
    systemPrompt: `You are Helmies Studio's Orchestrator Agent. You break down user requests into steps, estimate credit costs, and route each step to the right specialist agent.

Available agents:
- image: Generate or edit images (Flux, Midjourney, GPT-4o, etc.)
- video: Generate videos (Sora 2, Kling, Veo 3, etc.)
- audio: Generate music, voice, sound effects
- website: Build websites from prompts
- marketing: Create marketing content, ads, social media posts
- coding: Write, debug, or explain code

Respond ONLY in JSON format:
{
  "steps": [
    { "agent": "image", "task": "Generate a hero image of...", "params": { "model": "flux-dev", "prompt": "...", "aspect_ratio": "16:9" } },
    { "agent": "video", "task": "Animate the hero image", "params": { "model": "kling-v2.1-i2v", "image_url": "$STEP_1_OUTPUT", "prompt": "..." } }
  ],
  "summary": "Brief description of the plan"
}

Rules:
- Reference previous step outputs as $STEP_N_OUTPUT
- Always specify the model for each step
- Keep steps minimal and efficient
- If the user asks for something simple, use a single step`,
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

// ── Plan a task (orchestrator) ──
export async function planTask(userMessage, context = {}) {
  const messages = [
    { role: "system", content: AGENTS.orchestrator.systemPrompt },
    { role: "user", content: `Context: ${JSON.stringify(context)}\n\nRequest: ${userMessage}` },
  ];

  const response = await llmComplete(messages, { maxTokens: 2000, temperature: 0.3 });
  try {
    const json = JSON.parse(response.replace(/```json\n?/g, "").replace(/```/g, "").trim());
    const estimate = await estimateAgentTask(json.steps || []);
    return { ...json, estimate };
  } catch {
    return {
      steps: [{ agent: "image", task: userMessage, params: { model: "flux-dev", prompt: userMessage, aspect_ratio: "1:1" } }],
      summary: "Direct generation",
      estimate: { total: 2, breakdown: [{ tool: "image", model: "flux-dev", credits: 2 }] },
    };
  }
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
  if (params.image_url || params.images_list?.length) {
    const result = await generateI2I({ endpoint, ...params });
    return result.url || result.outputs?.[0];
  }
  const result = await generateImage({ endpoint, ...params });
  return result.url || result.outputs?.[0];
}

async function executeVideoStep(params) {
  const endpoint = params.endpoint || params.model;
  if (params.image_url) {
    const result = await generateI2V({ endpoint, ...params });
    return result.url || result.outputs?.[0];
  }
  const result = await generateVideo({ endpoint, ...params });
  return result.url || result.outputs?.[0];
}

async function executeAudioStep(params) {
  const endpoint = params.endpoint || params._modelId || params.model;
  const result = await generateAudio({ endpoint, ...params });
  return result.url || result.outputs?.[0];
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

// ── Execute full agent run with credit management ──
export async function executeAgentRun(userId, userMessage, context = {}) {
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
  if (user.credits < plan.estimate.total) {
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: "failed", error: "Insufficient credits" },
    });
    return { success: false, error: "Insufficient credits", creditsNeeded: plan.estimate.total, creditsAvailable: user.credits };
  }

  await debitCredits(userId, plan.estimate.total, `Agent run: ${plan.summary}`);

  const outputs = [];
  const stepResults = [];

  try {
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      try {
        const output = await executeStep(step, outputs);
        outputs.push(output);
        stepResults.push({ step: i + 1, agent: step.agent, status: "completed", output: typeof output === "string" ? output.slice(0, 500) : output });

        if (step.agent === "image" || step.agent === "video" || step.agent === "audio" || step.agent === "marketing") {
          await prisma.generation.create({
            data: {
              userId,
              tool: step.agent,
              model: step.params?.model || step.agent,
              prompt: step.params?.prompt || step.task || "",
              params: step.params,
              outputUrl: typeof output === "string" ? output : null,
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

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: "completed",
        creditsUsed: plan.estimate.total,
        result: { outputs, stepResults, summary: plan.summary },
      },
    });

    return { success: true, outputs, stepResults, summary: plan.summary, creditsUsed: plan.estimate.total };
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
  await prisma.user.update({ where: { id: userId }, data: { credits: { decrement: amount } } });
  await prisma.creditTransaction.create({ data: { userId, amount: -amount, type: "agent_run", description } });
}

async function creditUser(userId, amount, type, description) {
  await prisma.user.update({ where: { id: userId }, data: { credits: { increment: amount } } });
  await prisma.creditTransaction.create({ data: { userId, amount, type, description } });
}