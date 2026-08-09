import { handleGeneration } from "@/lib/generation-handler";
import { generateI2V } from "@/lib/generation";
import { getCreditCost } from "@/lib/credits";

export async function POST(req) {
  // req.clone(): handleGeneration reads the body too, and a Request body
  // can only be consumed once — without the clone every call to this route
  // died with "Body is unusable: Body has already been read".
  const body = await req.clone().json().catch(() => ({}));
  const cost = await getCreditCost("i2v", body.model);
  return handleGeneration(req, "i2v", cost, (params) => generateI2V(params));
}