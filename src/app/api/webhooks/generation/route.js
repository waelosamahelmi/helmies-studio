import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { creditUser } from "@/lib/session";
import { downloadAllMedia, extractKieResults } from "@/lib/media-download";

export async function POST(req) {
  try {
    const secret = process.env.WEBHOOK_SECRET || process.env.CRON_SECRET;
    if (secret) {
      const authHeader = req.headers.get("authorization");
      if (authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await req.json();

    // Parse both KIE and WaveSpeed callback formats
    const result = extractKieResults(body);

    const requestId = result?.taskId || body.request_id || body.data?.request_id || body.taskId || body.data?.taskId;
    const status = result?.state || body.status || body.data?.status;
    const urls = result?.urls || body.outputs || body.data?.output || (body.output_url ? [body.output_url] : []);
    const errorMsg = result?.error || body.error || body.data?.error || body.msg;

    if (!requestId) {
      return NextResponse.json({ error: "Missing task/request ID" }, { status: 400 });
    }

    let generation = await prisma.generation.findFirst({
      where: { requestId: requestId },
    }).catch(() => null);

    if (!generation) {
      generation = await prisma.generation.findFirst({
        where: { params: { path: ["requestId"], equals: requestId } },
      }).catch(() => null);
    }

    if (!generation) {
      // Try by generation ID
      const alt = await prisma.generation.findFirst({
        where: { id: requestId },
      }).catch(() => null);
      if (!alt) {
        return NextResponse.json({ error: "Generation not found" }, { status: 404 });
      }
      generation = alt;
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
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "failed", error: errorMsg || "Generation failed" },
      });

      if (generation.creditsUsed > 0) {
        await creditUser(generation.userId, generation.creditsUsed, "webhook_refund", `Refund: ${errorMsg || "Failed generation"}`);
      }

      return NextResponse.json({ success: true, refunded: true });
    }

    return NextResponse.json({ success: true, status: normalizedStatus });
  } catch (e) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}