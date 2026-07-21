import { handleGeneration } from "@/lib/generation-handler";
import { generateVideo } from "@/lib/generation";
import { getCreditCost } from "@/lib/credits";

export async function POST(req) {
  const body = await req.clone().json().catch(() => ({}));
  const cost = getCreditCost("video", body.model);
  return handleGeneration(req, "video", cost, (params) => generateVideo(params));
}