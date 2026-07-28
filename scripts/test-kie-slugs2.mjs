import { config } from "dotenv";
config();

const key = process.env.KIE_KEY;
const baseUrl = "https://api.kie.ai";

// The kie-sync pricing uses these as model names. Test them with
// a "text-to-image" task type hint in the input
const models = [
  "flux-dev",
  "flux-dev-image",
  "flux-dev-text-to-image",
  "flux-1.1-dev-image",
  "flux-1.1-dev-text-to-image",
  "flux-schnell-image",
  "flux-schnell-text-to-image",
  "imagen4-text-to-image",
  "imagen4-fast-text-to-image",
  "gpt-image-2-text-to-image",
  "midjourney-text-to-image",
  "kling-text-to-image",
  "wan-2-5-text-to-image",
  "wan-2-7-image",
  "seedream-5-pro-text-to-image",
  "ideogram-v3-text-to-image",
  "grok-imagine-text-to-image",
  "z-image",
  "z-image-text-to-image",
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
  // Small delay to avoid rate limiting
  await new Promise((r) => setTimeout(r, 500));
}