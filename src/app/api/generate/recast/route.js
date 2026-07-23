import { handleGeneration } from "@/lib/generation-handler";
import { processRecast } from "@/lib/generation";
import { getCreditCost } from "@/lib/credits";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const cost = await getCreditCost("recast", body.model);
  return handleGeneration(req, "recast", cost, (params) => processRecast(params));
}