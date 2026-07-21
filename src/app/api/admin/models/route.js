import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import prisma from "@/lib/prisma";
import { IMAGE_MODELS, I2I_MODELS, VIDEO_MODELS, I2V_MODELS, V2V_MODELS, LIPSYNC_MODELS, RECAST_MODELS, AUDIO_MODELS } from "@/lib/models";

const ALL_MODELS = [
  ...IMAGE_MODELS.map((m) => ({ ...m, category: "image" })),
  ...I2I_MODELS.map((m) => ({ ...m, category: "i2i" })),
  ...VIDEO_MODELS.map((m) => ({ ...m, category: "video" })),
  ...I2V_MODELS.map((m) => ({ ...m, category: "i2v" })),
  ...V2V_MODELS.map((m) => ({ ...m, category: "v2v" })),
  ...LIPSYNC_MODELS.map((m) => ({ ...m, category: "lipsync" })),
  ...RECAST_MODELS.map((m) => ({ ...m, category: "recast" })),
  ...AUDIO_MODELS.map((m) => ({ ...m, category: "audio" })),
];

export async function GET() {
  try {
    await requireAdmin();
    const pricing = await prisma.modelPricing.findMany();
    const pricingMap = new Map(pricing.map((p) => [p.modelId, p]));

    const models = ALL_MODELS.map((m) => {
      const p = pricingMap.get(m.id);
      return {
        id: m.id,
        name: m.name,
        provider: m.provider,
        category: m.category,
        isActive: p ? p.isActive : true,
        creditsCost: p?.creditsCost || null,
        providerCost: p?.providerCost || null,
        configured: !!p,
      };
    });

    return NextResponse.json({ models, total: models.length });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}

export async function POST(req) {
  try {
    await requireAdmin();
    const { modelId, modelType, providerName, providerCost, creditsCost, isActive } = await req.json();

    await prisma.modelPricing.upsert({
      where: { modelId },
      create: { modelId, modelType, providerName: providerName || "WaveSpeed", providerCost: providerCost || 0, creditsCost: creditsCost || 1, isActive: isActive ?? true },
      update: { providerCost, creditsCost, isActive },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    await requireAdmin();
    const { modelId } = await req.json();
    await prisma.modelPricing.delete({ where: { modelId } }).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}