import { handleGeneration } from "@/lib/generation-handler";
import { runClipping } from "@/lib/generation";
import { getCreditCost } from "@/lib/credits";

export async function POST(req) {
  const cost = getCreditCost("clipping", "default");
  return handleGeneration(req, "clipping", cost, (params) => runClipping(params));
}