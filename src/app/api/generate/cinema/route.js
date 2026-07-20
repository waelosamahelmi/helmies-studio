import { handleGeneration } from "@/lib/generation-handler";
import { generateImage, generateI2I } from "@/lib/muapi";
import { getCreditCost } from "@/lib/credits";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const isEdit = !!(body.image_url || body.images_list?.length);
  const cost = getCreditCost("cinema", isEdit ? "nano-banana-pro-edit" : "nano-banana-pro");
  const apiFn = isEdit
    ? (p) => generateI2I({ ...p, model: "nano-banana-pro-edit", endpoint: "nano-banana-pro-edit" })
    : (p) => generateImage({ ...p, model: "nano-banana-pro", endpoint: "nano-banana-pro" });
  return handleGeneration(req, "cinema", cost, apiFn);
}