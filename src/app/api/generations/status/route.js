import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUserWithCredits } from "@/lib/session";

export async function GET(req) {
  try {
    const user = await getCurrentUserWithCredits(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const offset = parseInt(searchParams.get("offset") || "0");

    if (id) {
      const gen = await prisma.generation.findFirst({
        where: { id, userId: user.id },
        select: { id: true, status: true, outputUrl: true, error: true, creditsUsed: true, createdAt: true, model: true, prompt: true },
      });
      if (!gen) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(gen);
    }

    const generations = await prisma.generation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: { id: true, status: true, outputUrl: true, error: true, creditsUsed: true, createdAt: true, model: true, prompt: true, tool: true },
    });

    const total = await prisma.generation.count({ where: { userId: user.id } });

    return NextResponse.json({ generations, total, hasMore: offset + limit < total });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
