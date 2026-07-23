import { handleGeneration } from "@/lib/generation-handler";
import { processV2V } from "@/lib/generation";
import { getCreditCost } from "@/lib/credits";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const cost = await getCreditCost("v2v", body.model);
  return handleGeneration(req, "v2v", cost, (params) => processV2V(params));
}