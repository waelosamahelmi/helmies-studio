import { handleGeneration } from "@/lib/generation-handler";
import { generateI2I } from "@/lib/muapi";
import { getCreditCost } from "@/lib/credits";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const cost = getCreditCost("i2i", body.model);
  return handleGeneration(req, "i2i", cost, (params) => generateI2I(params));
}