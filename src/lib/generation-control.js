// Stopping a run, and clearing away the ones that failed.
//
// Both are things the library could not do: a generation that hung had no
// off switch, and a wall of failures had no broom. Neither is cosmetic —
// a queue you cannot stop is one you cannot trust to start.
//
// The money rule is the same one the rest of the system obeys: failed work
// is never charged, and a reservation is either settled or released, never
// both. What is new here is that a cancel has THREE outcomes, not one, and
// which you get depends on whether the provider has already been told to
// do the work.
import prisma from "./prisma.js";
import { releaseReservation } from "./wallet.js";
import { log } from "./log.js";

export const LIVE_STATUSES = ["pending", "processing", "queued", "running"];
export const CLEARABLE_STATUSES = ["failed", "cancelled"];

/**
 * Ask a generation to stop.
 *
 * Returns { outcome, message }:
 *   "cancelled"  — it never reached a provider. Stopped outright, credits
 *                  released, nothing charged.
 *   "requested"  — it is already at a provider. We stop waiting, but the
 *                  provider will finish and bill us either way, so the
 *                  money is settled by the normal path when it lands.
 *                  Saying "cancelled" here would be a lie.
 *   "too_late"   — it already finished.
 */
export async function cancelGeneration(userId, generationId) {
  const generation = await prisma.generation.findFirst({ where: { id: generationId, userId } });
  if (!generation) return null;

  if (!LIVE_STATUSES.includes(generation.status)) {
    return { outcome: "too_late", message: "That one had already finished.", generation };
  }

  const job = await prisma.generationJob.findUnique({ where: { generationId } });

  // Never dispatched: nothing exists upstream, so this is a real cancel.
  const dispatched = Boolean(job?.providerRequestId);

  if (job && !dispatched) {
    // Claim it away from the worker in the same breath as cancelling, so a
    // worker that picks it up a millisecond later finds it already gone.
    const { count } = await prisma.generationJob.updateMany({
      where: { id: job.id, status: { in: ["queued", "running"] } },
      data: { status: "dead", cancelRequested: true, lastError: "Cancelled by the user." },
    });
    if (count === 0) {
      // It was claimed and dispatched between our read and our write.
      await prisma.generationJob.updateMany({ where: { id: job.id }, data: { cancelRequested: true } });
      return { outcome: "requested", message: "It had just started — we have stopped waiting for it.", generation };
    }
  } else if (job) {
    await prisma.generationJob.update({ where: { id: job.id }, data: { cancelRequested: true } });
  }

  if (dispatched) {
    log.info("generation_cancel_requested", { generationId, userId });
    return {
      outcome: "requested",
      message: "Asked to stop. It has already been sent to the provider, so it may still finish — and it is charged either way.",
      generation,
    };
  }

  await prisma.generation.updateMany({
    where: { id: generationId, status: { in: LIVE_STATUSES } },
    data: { status: "cancelled", error: "Cancelled before it ran." },
  });

  // Nothing ran, so nothing is owed. Release, never settle.
  try {
    await releaseReservation(userId, generationId);
  } catch (err) {
    log.error("generation_cancel_release_failed", { generationId, userId, err: err?.message });
  }

  log.info("generation_cancelled", { generationId, userId });
  return { outcome: "cancelled", message: "Stopped. Nothing was charged.", generation };
}

/**
 * Dismiss finished-and-failed runs from the library.
 *
 * They are HIDDEN, not deleted. A failed run records what went wrong and
 * what it cost, and that provenance outlives somebody's wish for a tidy
 * grid — it is what a refund argument is settled with. Live runs are never
 * touched: hiding one would leave it running with nothing on screen.
 */
export async function clearGenerations(userId, { ids = null } = {}) {
  const where = {
    userId,
    hiddenAt: null,
    status: { in: CLEARABLE_STATUSES },
    ...(Array.isArray(ids) && ids.length ? { id: { in: ids.slice(0, 500) } } : {}),
  };
  const { count } = await prisma.generation.updateMany({ where, data: { hiddenAt: new Date() } });
  return count;
}

/** Put them back. Nothing was destroyed, so nothing has to be recreated. */
export async function restoreGenerations(userId) {
  const { count } = await prisma.generation.updateMany({
    where: { userId, hiddenAt: { not: null } },
    data: { hiddenAt: null },
  });
  return count;
}
