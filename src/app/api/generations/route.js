import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const tool = searchParams.get("tool");
    const status = searchParams.get("status") || "completed";
    const limit = parseInt(searchParams.get("limit")) || 50;
    const offset = parseInt(searchParams.get("offset")) || 0;

    const where = {
      userId: user.id,
      status,
      ...(tool && tool !== "all" ? { tool } : {}),
    };

    const generations = await prisma.generation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    const total = await prisma.generation.count({ where });

    return NextResponse.json({ generations, total });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}