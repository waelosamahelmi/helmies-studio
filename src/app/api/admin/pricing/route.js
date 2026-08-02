import { NextResponse } from "next/server";
import { requireAdmin, logAudit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { getAllPricing, setModelPricing } from "@/lib/pricing-engine";

export async function GET(req) {
  try {
    await requireAdmin(req);
    return NextResponse.json(await getAllPricing());
  } catch (e) {
    return authzResponse(e);
  }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);
    const { modelId, modelType, providerName, providerCost, creditsCost } = await req.json();
    // setModelPricing rejects (never silently clamps) a creditsCost that
    // would price this model below its own provider cost — surface that as
    // a clear 400, not the generic 500 authzResponse's catch-all would give
    // a validation error.
    try {
      await setModelPricing(modelId, modelType, providerName, providerCost, creditsCost);
    } catch (validationError) {
      return NextResponse.json({ error: validationError.message }, { status: 400 });
    }
    await logAudit("admin_set_pricing", "model_pricing", modelId, { providerCost, creditsCost }, req);
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}