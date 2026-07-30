import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { executeStep } from "@/lib/agents";
import { estimateAgentTask } from "@/lib/pricing-engine";
import { detectAbuse } from "@/lib/security";
import { reserveCredits, settleReservation, releaseReservation, getWallet } from "@/lib/wallet";

// Mirror the wallet's `available` onto the legacy User.credits column so the
// existing UI keeps showing the right number. The wallet is the source of truth.
async function syncLegacyCredits(userId) {
  try {
    const w = await getWallet(userId);
    await prisma.user.update({ where: { id: userId }, data: { credits: w.available } });
  } catch {}
}

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

  // Ownership scoping: a workflow may only be executed by its owner.
  const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, userId } });
  if (!workflow) throw new Error("Workflow not found");

  const steps = workflow.steps;
  const estimate = await estimateAgentTask(steps);

  const run = await prisma.workflowRun.create({
    data: { workflowId, userId, status: "running", inputs },
  });

  // Reserve against the credit wallet (source of truth). The legacy
  // User.credits column is a mirror only — debiting it directly was a no-op
  // because syncUserCreditsFromWallet overwrites it from the wallet.
  try {
    await reserveCredits(userId, estimate.total, run.id);
  } catch (reserveErr) {
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: "failed", error: reserveErr.message },
    });
    throw new Error("Insufficient credits");
  }
  await syncLegacyCredits(userId);

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
        // Settle only the steps that actually ran; the remainder of the
        // reservation is released back to the wallet automatically.
        const consumed = Math.min(estimate.total, Math.floor(i * (estimate.total / steps.length)));
        await settleReservation(userId, run.id, consumed).catch(async () => {
          await releaseReservation(userId, run.id).catch(() => {});
        });
        await syncLegacyCredits(userId);
        return { success: false, error: stepError.message, stepResults, runId: run.id };
      }
    }

    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: "completed", outputs: { outputs, stepResults } },
    });

    await settleReservation(userId, run.id, estimate.total).catch(() => {});
    await syncLegacyCredits(userId);

    return { success: true, outputs, stepResults, runId: run.id, creditsUsed: estimate.total };
  } catch (error) {
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: "failed", error: error.message },
    });
    await releaseReservation(userId, run.id).catch(() => {});
    await syncLegacyCredits(userId);
    return { success: false, error: error.message };
  }
}

// ── Regenerate single step ──
export async function regenerateStep(workflowId, userId, stepIndex, newParams = {}) {
  // Ownership scoping: a workflow may only be regenerated by its owner.
  const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, userId } });
  if (!workflow) throw new Error("Workflow not found");

  if (!Array.isArray(workflow.steps) || !workflow.steps[stepIndex]) {
    throw new Error("Step not found");
  }

  const step = { ...workflow.steps[stepIndex], params: { ...workflow.steps[stepIndex].params, ...newParams } };
  const stepCost = (await estimateAgentTask(workflow.steps)).breakdown[stepIndex]?.credits || 2;

  // Fetch prior outputs from the most recent completed run — scoped to the
  // caller so another user's run outputs can never be read back.
  const lastRun = await prisma.workflowRun.findFirst({
    where: { workflowId, userId, status: "completed" },
    orderBy: { createdAt: "desc" },
  });
  const priorOutputs = lastRun?.outputs?.outputs || [];

  // Reserve against the wallet (source of truth) rather than the legacy
  // User.credits mirror, which the wallet sync overwrites.
  const jobId = `workflow_regen_${workflowId}_${stepIndex}_${randomUUID()}`;
  try {
    await reserveCredits(userId, stepCost, jobId);
  } catch {
    throw new Error("Insufficient credits");
  }
  await syncLegacyCredits(userId);

  try {
    const output = await executeStep(step, priorOutputs);
    await settleReservation(userId, jobId, stepCost).catch(() => {});
    await syncLegacyCredits(userId);
    return { success: true, output, creditsUsed: stepCost };
  } catch (error) {
    await releaseReservation(userId, jobId).catch(() => {});
    await syncLegacyCredits(userId);
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