import { handleGeneration } from "@/lib/generation-handler";
import { generateI2V } from "@/lib/generation";
import { getCreditCost } from "@/lib/credits";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const cost = getCreditCost("i2v", body.model);
  return handleGeneration(req, "i2v", cost, (params) => generateI2V(params));
}