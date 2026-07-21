import { getProvider, brandError } from "@/lib/providers";

export async function alibabaVideoGenerate(params) {
  const provider = getProvider("alibaba");
  const key = provider.getKey();
  if (!key) throw new Error("Alibaba API key not configured");

  const workspaceId = process.env.ALIBABA_WORKSPACE_ID;
  if (!workspaceId) throw new Error("ALIBABA_WORKSPACE_ID not configured");

  const baseUrl = `https://${workspaceId}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1`;

  const payload = {
    model: params.model || "wan-2.6-t2v",
    input: {
      prompt: params.prompt,
      aspect_ratio: params.aspect_ratio || "16:9",
      duration: params.duration || 5,
    },
  };

  if (params.image_url) payload.input.image_url = params.image_url;
  if (params.negative_prompt) payload.input.negative_prompt = params.negative_prompt;

  const res = await fetch(`${baseUrl}/video/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(brandError(txt));
  }

  const data = await res.json();
  const taskId = data.task_id || data.id;

  for (let attempt = 1; attempt <= 300; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const pollRes = await fetch(`${baseUrl}/video/generations/${taskId}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!pollRes.ok) {
        if (pollRes.status >= 500) continue;
        const txt = await pollRes.text();
        throw new Error(brandError(txt));
      }
      const pollData = await pollRes.json();
      const status = pollData.status?.toLowerCase();
      if (status === "succeeded" || status === "completed") {
        return {
          url: pollData.output?.video_url || pollData.output?.url,
          requestId: taskId,
        };
      }
      if (status === "failed" || status === "error") {
        throw new Error(brandError(pollData.error || ""));
      }
    } catch (e) {
      if (attempt === 300) throw e;
    }
  }
  throw new Error("Alibaba video generation timed out");
}

export async function alibabaImageGenerate(params) {
  const provider = getProvider("alibaba");
  const key = provider.getKey();
  if (!key) throw new Error("Alibaba API key not configured");

  const workspaceId = process.env.ALIBABA_WORKSPACE_ID;
  if (!workspaceId) throw new Error("ALIBABA_WORKSPACE_ID not configured");

  const baseUrl = `https://${workspaceId}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1`;

  const payload = {
    model: params.model || "qwen-image",
    input: {
      prompt: params.prompt,
      aspect_ratio: params.aspect_ratio || "1:1",
    },
  };

  if (params.negative_prompt) payload.input.negative_prompt = params.negative_prompt;
  if (params.width) payload.input.size = `${params.width}x${params.height}`;

  const res = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(brandError(txt));
  }

  const data = await res.json();
  return {
    url: data.data?.[0]?.url || data.output?.url,
    requestId: data.id,
  };
}
