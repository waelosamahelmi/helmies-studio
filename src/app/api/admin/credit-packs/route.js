import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";

// Mass-assignment allowlist (Phase 3 Task 6). Unknown/extra body keys are
// silently dropped (admin-only route; 400-on-extra would break loose admin
// UI payloads).
const CREDIT_PACK_FIELDS = ["name", "credits", "price", "stripePriceId", "isActive", "sortOrder"];

function pick(body, fields) {
  const out = {};
  for (const key of fields) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
}

export async function GET(req) {
  try { await requireAdmin(req); return NextResponse.json(await prisma.creditPack.findMany({ orderBy: { credits: "asc" } })); }
  catch (e) { return authzResponse(e); }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);
    const body = await req.json();
    return NextResponse.json(
      await prisma.creditPack.create({ data: pick(body, CREDIT_PACK_FIELDS) }),
      { status: 201 },
    );
  } catch (e) { return authzResponse(e); }
}
