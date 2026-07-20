import { handleGeneration } from "@/lib/generation-handler";
import { generateAudio } from "@/lib/muapi";
import { getCreditCost } from "@/lib/credits";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const cost = getCreditCost("audio", body.model || body._modelId);
  return handleGeneration(req, "audio", cost, (params) => generateAudio(params));
}