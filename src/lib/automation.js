import prisma from "@/lib/prisma";
import { adjustWalletTo, sweepExpiredReservations } from "@/lib/wallet";
import { sweepTimedOutJobs } from "@/lib/job-runner";

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
    // Prisma 7: the having aggregate filter must be scoped to the field
    // being grouped by — a bare `having: { _count: { gte } }` throws
    // "Unknown argument `_count`" at the database.
    having: { model: { _count: { gte: MODEL_FAILURE_THRESHOLD } } },
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
    // Prisma 7: same field-scoped having requirement as above.
    having: { userId: { _count: { gte: ABUSE_THRESHOLD } } },
  });

  const suspended = [];
  for (const u of heavy) {
    const user = await prisma.user.findUnique({ where: { id: u.userId }, select: { credits: true, role: true } });
    if (user?.role === "admin") continue;
    if (user && user.credits > ABUSE_SUSPEND_CREDITS) {
      try {
        await adjustWalletTo(
          u.userId,
          ABUSE_SUSPEND_CREDITS,
          `Auto-suspended: ${u._count} generations in ${ABUSE_WINDOW_MINUTES}min`
        );
        suspended.push({ userId: u.userId, generations: u._count });
      } catch (err) {
        // A contested wallet (concurrent spend/topup racing this clamp)
        // throws on CAS miss — log and continue so one bad row doesn't
        // abort the whole abuse sweep.
        console.error(`autoSuspendAbusiveUsers: failed to adjust wallet for ${u.userId}:`, err);
      }
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
  // Promise.allSettled — not Promise.all — so one leg throwing (e.g. a
  // groupBy/query error) can never suppress the results of the other three.
  // A single rejected leg is reported as { error } instead of aborting the
  // whole cron run. `jobs` (Phase 4A Task 7) is the fourth leg, added in the
  // SAME isolated style established for `reservations` — sweepTimedOutJobs
  // (src/lib/job-runner.js) is exactly as load-bearing for money safety as
  // sweepExpiredReservations, so it gets the same failure isolation.
  const [models, users, reservations, jobs] = await Promise.allSettled([
    autoDisableFailingModels(),
    autoSuspendAbusiveUsers(),
    sweepExpiredReservations(),
    sweepTimedOutJobs(),
  ]);

  const settle = (outcome) =>
    outcome.status === "fulfilled" ? outcome.value : { error: outcome.reason?.message ?? String(outcome.reason) };

  return {
    models: settle(models),
    users: settle(users),
    reservations: settle(reservations),
    jobs: settle(jobs),
    timestamp: new Date().toISOString(),
  };
}