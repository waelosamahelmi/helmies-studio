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
    const { request_id, status, output_url, error } = body;

    if (!request_id) {
      return NextResponse.json({ error: "Missing request_id" }, { status: 400 });
    }

    const generation = await prisma.generation.findFirst({
      where: { params: { path: ["requestId"], equals: request_id } },
    }).catch(() => null);

    if (!generation) {
      const alt = await prisma.generation.findFirst({
        where: { id: request_id },
      }).catch(() => null);
      if (!alt) {
        return NextResponse.json({ error: "Generation not found" }, { status: 404 });
      }
      return handleUpdate(alt, status, output_url, error);
    }

    return handleUpdate(generation, status, output_url, error);
  } catch (e) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function handleUpdate(generation, status, output_url, error) {
  const normalizedStatus = status?.toLowerCase();
  if (normalizedStatus === "completed" || normalizedStatus === "succeeded" || normalizedStatus === "success") {
    await prisma.generation.update({
      where: { id: generation.id },
      data: { status: "completed", outputUrl: output_url || generation.outputUrl },
    });
    return NextResponse.json({ success: true });
  }

  if (normalizedStatus === "failed" || normalizedStatus === "error") {
    await prisma.generation.update({
      where: { id: generation.id },
      data: { status: "failed", error: error || "Generation failed" },
    });

    if (generation.creditsUsed > 0) {
      await creditUser(generation.userId, generation.creditsUsed, "webhook_refund", `Refund: ${error || "Failed generation"}`);
    }

    return NextResponse.json({ success: true, refunded: true });
  }

  return NextResponse.json({ success: true, status: normalizedStatus });
}
