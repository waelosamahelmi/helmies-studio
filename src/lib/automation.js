import prisma from "@/lib/prisma";

const MODEL_FAILURE_THRESHOLD = 5;
const MODEL_FAILURE_WINDOW_MINUTES = 30;
const ABUSE_THRESHOLD = 100;
const ABUSE_WINDOW_MINUTES = 60;
const ABUSE_SUSPEND_CREDITS = 0;

// ── Auto-disable models with high failure rates ──
export async function autoDisableFailingModels() {
  const windowStart = new Date(Date.now() - MODEL_FAILURE_WINDOW_MINUTES * 60 * 1000);

  const failing = await prisma.generation.groupBy({
    by: ["model"],
    where: { status: "failed", createdAt: { gte: windowStart } },
    _count: true,
    having: { _count: { gte: MODEL_FAILURE_THRESHOLD } },
  });

  const disabled = [];
  for (const f of failing) {
    const pricing = await prisma.modelPricing.findUnique({ where: { modelId: f.model } });
    if (pricing?.isActive) {
      await prisma.modelPricing.update({
        where: { modelId: f.model },
        data: { isActive: false },
      });
      disabled.push(f.model);
    }
  }

  if (disabled.length > 0) {
    await prisma.auditLog.create({
      data: {
        action: "auto_disable_model",
        resource: "model_pricing",
        metadata: { models: disabled, reason: "high_failure_rate" },
      },
    });
  }

  return { disabled, checked: failing.length };
}

// ── Auto-suspend abusive users ──
export async function autoSuspendAbusiveUsers() {
  const windowStart = new Date(Date.now() - ABUSE_WINDOW_MINUTES * 60 * 1000);

  const heavy = await prisma.generation.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: windowStart } },
    _count: true,
    having: { _count: { gte: ABUSE_THRESHOLD } },
  });

  const suspended = [];
  for (const u of heavy) {
    const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { credits: true, role: true } });
    if (user?.role === "admin") continue;
    if (user && user.credits > ABUSE_SUSPEND_CREDITS) {
      await prisma.user.update({
        where: { id: u.userId },
        data: { credits: ABUSE_SUSPEND_CREDITS },
      });
      await prisma.creditTransaction.create({
        data: {
          userId: u.userId,
          amount: -user.credits,
          type: "abuse_suspension",
          description: `Auto-suspended: ${u._count} generations in ${ABUSE_WINDOW_MINUTES}min`,
        },
      });
      suspended.push({ userId: u.userId, generations: u._count });
    }
  }

  if (suspended.length > 0) {
    await prisma.auditLog.create({
      data: {
        action: "auto_suspend_user",
        resource: "user",
        metadata: { users: suspended, reason: "abuse_detection" },
      },
    });
  }

  return { suspended, checked: heavy.length };
}

// ── Run all automation checks ──
export async function runAutomation() {
  const [models, users] = await Promise.all([
    autoDisableFailingModels(),
    autoSuspendAbusiveUsers(),
  ]);
  return { models, users, timestamp: new Date().toISOString() };
}