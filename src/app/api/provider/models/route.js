import { NextResponse } from "next/server";
import { fetchWaveSpeedModels } from "@/lib/providers";

export async function GET() {
  try {
    const models = await fetchWaveSpeedModels();
    return NextResponse.json({ models, total: models.length });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
