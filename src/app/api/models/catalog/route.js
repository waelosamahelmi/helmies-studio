import { NextResponse } from "next/server";
import { getCatalogModel, getCatalogModels } from "@/lib/model-catalog";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (id) {
      const model = await getCatalogModel(id);
      return model ? NextResponse.json({ model }) : NextResponse.json({ error: "Model not found" }, { status: 404 });
    }
    const models = await getCatalogModels({
      capability: searchParams.get("capability") || undefined,
      modelType: searchParams.get("type") || undefined,
      provider: searchParams.get("provider") || undefined,
    });
    return NextResponse.json({ models, total: models.length });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Catalog unavailable" }, { status: 500 });
  }
}

