import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { creditUser } from "@/lib/session";
import { downloadAllMedia, extractKieResults } from "@/lib/media-download";

export async function POST(req) {
  try {
    // Fail CLOSED: with no secret configured this endpoint would otherwise be
    // an unauthenticated way to mark generations failed and mint refunds.
    const secret = process.env.WEBHOOK_SECRET || process.env.CRON_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Parse the KIE callback format (plus generic request_id fields for backward compat)
    const result = extractKieResults(body);

    // Also check direct fields for backward compat
    const requestId = result?.taskId || body.request_id || body.data?.request_id || body.taskId || body.data?.taskId;
    const status = result?.state || body.status || body.data?.status;
    const urls = result?.urls || body.outputs || body.data?.output || (body.output_url ? [body.output_url] : []);
    const errorMsg = result?.error || body.error || body.data?.error || body.msg;

    if (!requestId) {
      return NextResponse.json({ error: "Missing task/request ID" }, { status: 400 });
    }

    let generation = await prisma.generation.findFirst({
      where: { requestId: requestId },
    });

    if (!generation) {
      generation = await prisma.generation.findFirst({
        where: { params: { path: ["requestId"], equals: requestId } },
      });
    }

    if (!generation) {
      return NextResponse.json({ error: "Generation not found" }, { status: 404 });
    }

    // Idempotency guard: a generation that already reached a terminal state
    // must not be re-processed — replaying a "failed" callback would credit
    // the user again on every delivery.
    if (generation.status === "failed" || generation.status === "completed") {
      return NextResponse.json({ success: true, alreadyProcessed: true, status: generation.status });
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

      return NextResponse.json({ success: true, downloaded: !!localUrl });
    }

    if (isFail) {
      // Conditional write: only the delivery that actually transitions the row
      // out of a non-terminal state is allowed to issue the refund.
      const transitioned = await prisma.generation.updateMany({
        where: { id: generation.id, status: { notIn: ["failed", "completed"] } },
        data: { status: "failed", error: errorMsg || "Generation failed" },
      });

      if (transitioned.count === 0) {
        return NextResponse.json({ success: true, alreadyProcessed: true });
      }

      if (generation.creditsUsed > 0) {
        await creditUser(generation.userId, generation.creditsUsed, "webhook_refund", `Refund: ${errorMsg || "Failed generation"}`);
      }

      return NextResponse.json({ success: true, refunded: true });
    }

    // Still processing
    return NextResponse.json({ success: true, status: normalizedStatus });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}