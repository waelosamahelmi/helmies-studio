import { getProvider, submitOnly, pollProviderResult } from "@/lib/providers";

function getAlibabaProvider() {
  const provider = getProvider("alibaba");
  if (!provider.getKey()) throw new Error("Alibaba API key not configured");
  if (!process.env.ALIBABA_WORKSPACE_ID) throw new Error("ALIBABA_WORKSPACE_ID not configured");
  return provider;
}

export async function alibabaVideoGenerate(params) {
  const provider = getAlibabaProvider();
  const model = params.model || "wan-2.6-t2v";

  const { requestId, immediateResult } = await submitOnly(provider, model, {
    model,
    prompt: params.prompt,
    aspect_ratio: params.aspect_ratio || "16:9",
    duration: params.duration || 5,
    ...(params.image_url ? { image_url: params.image_url } : {}),
    ...(params.negative_prompt ? { negative_prompt: params.negative_prompt } : {}),
  });

  if (immediateResult) {
    const outputs = immediateResult.outputs || [];
    return { url: outputs[0], requestId: null };
  }

  const result = await pollProviderResult(provider, requestId, 300, 2000);
  return { url: result.outputs?.[0] || result.url, requestId };
}

export async function alibabaImageGenerate(params) {
  const provider = getAlibabaProvider();
  const model = params.model || "qwen-image";

  const { requestId, immediateResult } = await submitOnly(provider, model, {
    model,
    prompt: params.prompt,
    aspect_ratio: params.aspect_ratio || "1:1",
    ...(params.width ? { size: `${params.width}x${params.height}` } : {}),
    ...(params.negative_prompt ? { negative_prompt: params.negative_prompt } : {}),
  });

  if (immediateResult) {
    const outputs = immediateResult.outputs || [];
    return { url: outputs[0], requestId: null };
  }

  if (!requestId) throw new Error("Alibaba image generation returned no result");

  const result = await pollProviderResult(provider, requestId, 60, 2000);
  return { url: result.outputs?.[0] || result.url, requestId };
}
