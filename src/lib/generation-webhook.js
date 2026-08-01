// Shared handler for the generation provider callbacks. Both
// src/app/api/webhooks/generation-complete/route.js and
// src/app/api/webhooks/generation/route.js are thin wrappers around
// handleGenerationWebhook — they only own the transport concerns (reading
// headers/auth, parsing the request body, translating the returned
// { status, response } into a NextResponse).
//
// Refund rule (money-correctness): a failure delivery only refunds if it is
// the delivery that actually transitions the Generation out of a
// non-terminal state. The transition + refund happen inside one
// prisma.$transaction so a crash between them can never leave the row
// "failed" with no refund, or refund without the row settling to "failed".
// A second (duplicate/retried) delivery for an already-terminal generation
// short-circuits to `alreadyProcessed` before the transaction ever opens,
// and — belt and suspenders — the conditional `updateMany` inside the
// transaction guards against a race between two concurrent deliveries too:
// only the one that matches `status notIn [failed, completed]` gets count 1
// and issues the refund.
import prisma from "@/lib/prisma";
import { refundCredits } from "@/lib/wallet";
import { downloadAllMedia, extractKieResults } from "@/lib/media-download";

export async function handleGenerationWebhook(body) {
  try {
    // Parse the KIE callback format (plus generic request_id fields for
    // backward compat). This extraction is identical between the two
    // legacy routes — there was never a real payload-format difference
    // between them, only a difference in how far the generation lookup
    // fell back (see below).
    const kie = extractKieResults(body);

    const requestId = kie?.taskId || body.request_id || body.data?.request_id || body.taskId || body.data?.taskId;
    const status = kie?.state || body.status || body.data?.status;
    const urls = kie?.urls || body.outputs || body.data?.output || (body.output_url ? [body.output_url] : []);
    const errorMsg = kie?.error || body.error || body.data?.error || body.msg;

    if (!requestId) {
      return { status: 400, response: { error: "Missing task/request ID" } };
    }

    let generation = await prisma.generation.findFirst({
      where: { requestId },
    }).catch(() => null);

    if (!generation) {
      generation = await prisma.generation.findFirst({
        where: { params: { path: ["requestId"], equals: requestId } },
      }).catch(() => null);
    }

    if (!generation) {
      // Fallback: some callers pass the Generation's own id as the
      // "request id" (this was only present in one of the two legacy
      // routes; kept here since it's a strict superset — it only kicks in
      // once both requestId-based lookups above have already failed).
      generation = await prisma.generation.findFirst({
        where: { id: requestId },
      }).catch(() => null);
    }

    if (!generation) {
      return { status: 404, response: { error: "Generation not found" } };
    }

    // Idempotency guard: a generation that already reached a terminal state
    // must not be re-processed — replaying a "failed" callback would credit
    // the user again on every delivery.
    if (generation.status === "failed" || generation.status === "completed") {
      return { status: 200, response: { success: true, alreadyProcessed: true, status: generation.status } };
    }

    const normalizedStatus = status?.toLowerCase();
    const isSuccess = normalizedStatus === "completed" || normalizedStatus === "succeeded" || normalizedStatus === "success";
    const isFail = normalizedStatus === "failed" || normalizedStatus === "error" || normalizedStatus === "fail";

    if (isSuccess) {
      // Download media to our server
      let localUrl = null;
      if (urls && urls.length > 0) {
        localUrl = await downloadAllMedia(urls);
      }

      await prisma.generation.update({
        where: { id: generation.id },
        data: {
          status: "completed",
          outputUrl: localUrl || urls?.[0] || generation.outputUrl,
        },
      });

      return { status: 200, response: { success: true, downloaded: !!localUrl } };
    }

    if (isFail) {
      const txResult = await prisma.$transaction(async (tx) => {
        // Conditional write: only the delivery that actually transitions the
        // row out of a non-terminal state is allowed to issue the refund.
        const transitioned = await tx.generation.updateMany({
          where: { id: generation.id, status: { notIn: ["failed", "completed"] } },
          data: { status: "failed", error: errorMsg || "Generation failed" },
        });
        if (transitioned.count === 0) return { alreadyProcessed: true };

        if (generation.creditsUsed > 0) {
          await refundCredits(generation.userId, generation.creditsUsed, generation.id,
            `Refund: ${errorMsg || "Failed generation"}`, tx);
        }
        return { refunded: generation.creditsUsed > 0 };
      });

      if (txResult.alreadyProcessed) {
        return { status: 200, response: { success: true, alreadyProcessed: true } };
      }
      return { status: 200, response: { success: true, refunded: txResult.refunded } };
    }

    // Still processing
    return { status: 200, response: { success: true, status: normalizedStatus } };
  } catch {
    return { status: 500, response: { error: "Internal error" } };
  }
}
