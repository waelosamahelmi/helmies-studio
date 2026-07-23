import { handleGeneration } from "@/lib/generation-handler";
import { processLipSync } from "@/lib/generation";
import { getCreditCost } from "@/lib/credits";

export async function POST(req) {
  const body = await req.clone().json().catch(() => ({}));
  const cost = await getCreditCost("lipsync", body.model);
  return handleGeneration(req, "lipsync", cost, (params) => processLipSync(params));
}