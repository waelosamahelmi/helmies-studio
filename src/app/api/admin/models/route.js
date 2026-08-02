import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";
import { IMAGE_MODELS, I2I_MODELS, VIDEO_MODELS, I2V_MODELS, V2V_MODELS, LIPSYNC_MODELS, RECAST_MODELS, AUDIO_MODELS } from "@/lib/models";
import { assertCreditsCoverCost } from "@/lib/pricing-engine";

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

export async function GET(req) {
  try {
    await requireAdmin(req);
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
        background: p?.background || null,
        backgroundOverlay: p?.backgroundOverlay ?? null,
        textColor: p?.textColor || null,
        configured: !!p,
      };
    });

    return NextResponse.json({ models, total: models.length });
  } catch (e) {
    return authzResponse(e);
  }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);
    const { modelId, modelType, providerName, providerCost, creditsCost, isActive, background, backgroundOverlay, textColor } = await req.json();

    const updateData = {};
    if (providerCost != null) updateData.providerCost = providerCost;
    if (creditsCost != null) updateData.creditsCost = creditsCost;
    if (isActive != null) updateData.isActive = isActive;
    if (background !== undefined) updateData.background = background;
    if (backgroundOverlay !== undefined) updateData.backgroundOverlay = backgroundOverlay;
    if (textColor !== undefined) updateData.textColor = textColor;

    // Margin floor (code review follow-up): this is a partial update (only
    // fields present in the body land in updateData), so the EFFECTIVE
    // providerCost/creditsCost after this write — not just whatever this
    // one request happened to include — is what must clear the floor. A
    // request that only changes creditsCost, leaving providerCost at
    // whatever's already on the row, must still be checked against that
    // existing value.
    const existing = await prisma.modelPricing.findUnique({ where: { modelId } });
    const effectiveProviderCost = updateData.providerCost ?? existing?.providerCost ?? 0;
    const effectiveCreditsCost = updateData.creditsCost ?? existing?.creditsCost ?? (creditsCost || 1);
    try {
      assertCreditsCoverCost(effectiveProviderCost, effectiveCreditsCost);
    } catch (validationError) {
      return NextResponse.json({ error: validationError.message }, { status: 400 });
    }

    await prisma.modelPricing.upsert({
      where: { modelId },
      create: { modelId, modelType, providerName: providerName || "KIE", providerCost: providerCost || 0, creditsCost: creditsCost || 1, isActive: isActive ?? true, background: background || null, backgroundOverlay: backgroundOverlay ?? null, textColor: textColor || null },
      update: updateData,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}

export async function DELETE(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);
    const { modelId } = await req.json();
    await prisma.modelPricing.delete({ where: { modelId } }).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}