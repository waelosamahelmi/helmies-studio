import { config } from "dotenv";
config();

const key = process.env.KIE_KEY;
const baseUrl = "https://api.kie.ai";

const models = [
  "flux-dev",
  "flux-1-dev",
  "flux-1.1-dev",
  "flux-schnell",
  "flux-2-dev",
  "flux-kontext-dev",
  "flux-kontext-pro",
  "imagen4",
  "imagen4-fast",
  "imagen4-ultra",
  "gpt-image-1.5",
  "gpt-image-2",
  "midjourney",
  "kling-text-to-image",
  "wan-2.5-text-to-image",
  "wan-2.7-image",
  "seedream-5-pro-text-to-image",
  "grok-imagine-text-to-image",
  "ideogram-v3-text-to-image",
  "z-image",
  "qwen-text-to-image",
  "hunyuan-image-3",
];

for (const model of models) {
  const res = await fetch(`${baseUrl}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      input: { prompt: "A cinematic flying horse", aspect_ratio: "1:1" },
    }),
  });
  const text = await res.text();
  const ok = text.includes('"taskId"') || text.includes('"code":200');
  console.log(`${ok ? "✅" : "❌"} ${model}: ${text.substring(0, 80)}`);
}