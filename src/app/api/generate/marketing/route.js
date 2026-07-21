import { handleGeneration } from "@/lib/generation-handler";
import { generateMarketingAd } from "@/lib/generation";
import { getCreditCost } from "@/lib/credits";

export async function POST(req) {
  const cost = getCreditCost("marketing", "default");
  return handleGeneration(req, "marketing", cost, (params) => generateMarketingAd(params));
}