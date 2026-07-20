import { handleGeneration } from "@/lib/generation-handler";
import { runMotionGraphics, runMotionGraphicsEdit } from "@/lib/muapi";
import { getCreditCost } from "@/lib/credits";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const cost = getCreditCost("motion", "default");
  const apiFn = body.request_id ? runMotionGraphicsEdit : runMotionGraphics;
  return handleGeneration(req, "motion", cost, (params) => apiFn(params));
}