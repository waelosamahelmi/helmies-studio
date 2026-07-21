import { handleGeneration } from "@/lib/generation-handler";
import { generateImage } from "@/lib/generation";
import { getCreditCost } from "@/lib/credits";

export async function POST(req) {
  const body = await req.clone().json().catch(() => ({}));
  const cost = getCreditCost("image", body.model);
  return handleGeneration(req, "image", cost, (params) => generateImage(params));
}