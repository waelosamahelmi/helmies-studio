import { handleGeneration } from "@/lib/generation-handler";
import { generateImage, generateI2I } from "@/lib/generation";
import { getCreditCost } from "@/lib/credits";

export async function POST(req) {
  // req.clone(): handleGeneration reads the body too, and a Request body
  // can only be consumed once — without the clone every call to this route
  // died with "Body is unusable: Body has already been read".
  const body = await req.clone().json().catch(() => ({}));
  const isEdit = !!(body.image_url || body.images_list?.length);
  const cost = await getCreditCost("cinema", isEdit ? "nano-banana-pro-edit" : "nano-banana-pro");
  const apiFn = isEdit
    ? (p) => generateI2I({ ...p, model: "nano-banana-pro-edit", endpoint: "nano-banana-pro-edit" })
    : (p) => generateImage({ ...p, model: "nano-banana-pro", endpoint: "nano-banana-pro" });
  return handleGeneration(req, "cinema", cost, apiFn);
}