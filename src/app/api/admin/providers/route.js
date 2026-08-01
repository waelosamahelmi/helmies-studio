import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    await requireAdmin(req);
    const providers = await prisma.providerConfig.findMany();
    return NextResponse.json(
      providers.map(({ apiKey, ...rest }) => ({
        ...rest,
        hasApiKey: Boolean(apiKey),
        apiKeyLast4: apiKey ? apiKey.slice(-4) : null,
      })),
    );
  } catch (e) {
    return authzResponse(e);
  }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);
    const { name, type, apiKey, baseUrl, markup, isActive } = await req.json();
    const trimmed = typeof apiKey === "string" ? apiKey.trim() : "";
    // Masked placeholders (••••1234 / ****1234) round-trip from the GET shape.
    const keyProvided = trimmed.length > 0 && !/^[•*]/.test(trimmed);
    await prisma.providerConfig.upsert({
      where: { name },
      create: {
        name, type, baseUrl,
        apiKey: keyProvided ? trimmed : null,
        markup: markup || 2.5,
        isActive: isActive ?? true,
      },
      update: {
        type, baseUrl, markup, isActive,
        ...(keyProvided ? { apiKey: trimmed } : {}),
      },
    });
    await logAudit("admin_set_provider", "provider", name, { markup, isActive }, req);
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}