import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { quoteCatalogModel } from "@/lib/model-catalog";

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { modelId, params = {} } = await req.json();
    if (!modelId) return NextResponse.json({ error: "modelId is required" }, { status: 400 });
    const quote = await quoteCatalogModel(modelId, params);
    // Trim to a public-safe shape: quoteCatalogModel()'s full return spreads
    // providerCost/unitPrice/multiplier/matchedRule and markup, which discloses
    // wholesale cost and margin to any signed-in caller. Server-side callers that
    // need the full quote (generate/async, generation-handler.js) import
    // quoteCatalogModel directly instead of hitting this route.
    const body = quote.valid
      ? { valid: true, modelId: quote.modelId, credits: quote.credits }
      : { valid: false, modelId, errors: quote.errors };
    return NextResponse.json(body, { status: quote.valid ? 200 : 422 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Quote failed" }, { status: 400 });
  }
}
