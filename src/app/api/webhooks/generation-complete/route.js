import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { creditUser } from "@/lib/session";

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
    const { request_id, status, outputs, error } = body;

    if (!request_id) {
      return NextResponse.json({ error: "Missing request_id" }, { status: 400 });
    }

    const generation = await prisma.generation.findFirst({
      where: { requestId: request_id },
    });

    if (!generation) {
      return NextResponse.json({ error: "Generation not found" }, { status: 404 });
    }

    if (status === "completed" || status === "succeeded") {
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "completed", outputUrl: outputs?.[0] },
      });
    } else if (status === "failed" || status === "error") {
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "failed", error: error || "Generation failed" },
      });
      if (generation.creditsUsed > 0) {
        await creditUser(generation.userId, generation.creditsUsed, "webhook_refund", `Refund: ${error || "Failed generation"}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}