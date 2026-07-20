import prisma from "@/lib/prisma";
import { executeStep } from "@/lib/agents";
import { estimateAgentTask } from "@/lib/pricing-engine";
import { detectAbuse } from "@/lib/security";

// ── Create workflow ──
export async function createWorkflow(userId, name, description, steps) {
  const estimate = await estimateAgentTask(steps);
  return prisma.workflow.create({
    data: { userId, name, description, steps, status: "ready" },
  });
}

// ── Get user workflows ──
export async function getUserWorkflows(userId) {
  return prisma.workflow.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { runs: { take: 5, orderBy: { createdAt: "desc" } } },
  });
}

// ── Get template workflows ──
export async function getTemplateWorkflows() {
  return prisma.workflow.findMany({
    where: { isTemplate: true },
    orderBy: { name: "asc" },
  });
}

// ── Get published workflows ──
export async function getPublishedWorkflows() {
  return prisma.workflow.findMany({
    where: { isPublic: true },
    orderBy: { name: "asc" },
  });
}

// ── Update workflow ──
export async function updateWorkflow(workflowId, userId, data) {
  return prisma.workflow.updateMany({
    where: { id: workflowId, userId },
    data,
  });
}

// ── Delete workflow ──
export async function deleteWorkflow(workflowId, userId) {
  return prisma.workflow.deleteMany({ where: { id: workflowId, userId } });
}

// ── Execute workflow ──
export async function executeWorkflow(workflowId, userId, inputs = {}) {
  const abuse = await detectAbuse(userId);
  if (abuse.flagged) {
    return { success: false, error: `Request blocked: ${abuse.reason}` };
  }

  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow) throw new Error("Workflow not found");

  const steps = workflow.steps;
  const estimate = await estimateAgentTask(steps);

  const result = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: estimate.total } },
    data: { credits: { decrement: estimate.total } },
  });
  if (result.count === 0) throw new Error("Insufficient credits");
  await prisma.creditTransaction.create({
    data: { userId, amount: -estimate.total, type: "workflow", description: `Workflow: ${workflow.name}` },
  });

  const run = await prisma.workflowRun.create({
    data: { workflowId, userId, status: "running", inputs },
  });

  const outputs = [];
  const stepResults = [];

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = { ...steps[i] };
      if (step.params) {
        for (const [key, value] of Object.entries(step.params)) {
          if (typeof value === "string" && value.startsWith("$INPUT_")) {
            const inputKey = value.replace("$INPUT_", "").toLowerCase();
            step.params[key] = inputs[inputKey] || value;
          }
          if (typeof value === "string" && value.startsWith("$STEP_")) {
            const stepNum = parseInt(value.match(/\d+/)?.[0]) - 1;
            step.params[key] = outputs[stepNum] || value;
          }
        }
      }

      try {
        const output = await executeStep(step, outputs);
        outputs.push(output);
        stepResults.push({ step: i + 1, agent: step.agent, status: "completed", output: typeof output === "string" ? output.slice(0, 500) : output });
      } catch (stepError) {
        stepResults.push({ step: i + 1, agent: step.agent, status: "failed", error: stepError.message });
        await prisma.workflowRun.update({
          where: { id: run.id },
          data: { status: "failed", error: stepError.message, outputs: { stepResults } },
        });
        const refund = estimate.total - (i * (estimate.total / steps.length));
        await prisma.user.update({ where: { id: userId }, data: { credits: { increment: Math.ceil(refund) } } });
        await prisma.creditTransaction.create({
          data: { userId, amount: Math.ceil(refund), type: "workflow_refund", description: `Workflow refund: step ${i + 1} failed` },
        });
        return { success: false, error: stepError.message, stepResults, runId: run.id };
      }
    }

    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: "completed", outputs: { outputs, stepResults } },
    });

    return { success: true, outputs, stepResults, runId: run.id, creditsUsed: estimate.total };
  } catch (error) {
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: "failed", error: error.message },
    });
    return { success: false, error: error.message };
  }
}

// ── Regenerate single step ──
export async function regenerateStep(workflowId, userId, stepIndex, newParams = {}) {
  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow) throw new Error("Workflow not found");

  const step = { ...workflow.steps[stepIndex], params: { ...workflow.steps[stepIndex].params, ...newParams } };
  const stepCost = (await estimateAgentTask(workflow.steps)).breakdown[stepIndex]?.credits || 2;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  if (user.credits < stepCost) throw new Error("Insufficient credits");

  // Fetch prior outputs from the most recent completed run
  const lastRun = await prisma.workflowRun.findFirst({
    where: { workflowId, status: "completed" },
    orderBy: { createdAt: "desc" },
  });
  const priorOutputs = lastRun?.outputs?.outputs || [];

  const result = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: stepCost } },
    data: { credits: { decrement: stepCost } },
  });
  if (result.count === 0) throw new Error("Insufficient credits");

  await prisma.creditTransaction.create({
    data: { userId, amount: -stepCost, type: "workflow_regen", description: `Regenerate step ${stepIndex + 1}` },
  });

  try {
    const output = await executeStep(step, priorOutputs);
    return { success: true, output, creditsUsed: stepCost };
  } catch (error) {
    await prisma.user.update({ where: { id: userId }, data: { credits: { increment: stepCost } } });
    return { success: false, error: error.message };
  }
}

// ── Publish workflow ──
export async function publishWorkflow(workflowId, userId) {
  return prisma.workflow.updateMany({
    where: { id: workflowId, userId },
    data: { isPublic: true },
  });
}

// ── Make workflow a template (admin) ──
export async function makeTemplate(workflowId) {
  return prisma.workflow.update({
    where: { id: workflowId },
    data: { isTemplate: true, isPublic: true },
  });
}