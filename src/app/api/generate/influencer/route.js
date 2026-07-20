import { handleGeneration } from "@/lib/generation-handler";
import { generateImage } from "@/lib/muapi";
import { getCreditCost } from "@/lib/credits";

export async function POST(req) {
  const cost = getCreditCost("influencer", "nano-banana-pro");
  return handleGeneration(req, "influencer", cost, (params) =>
    generateImage({ ...params, model: "nano-banana-pro", endpoint: "nano-banana-pro" })
  );
}