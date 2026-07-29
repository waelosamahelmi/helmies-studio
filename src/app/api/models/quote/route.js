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
    return NextResponse.json(quote, { status: quote.valid ? 200 : 422 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Quote failed" }, { status: 400 });
  }
}
