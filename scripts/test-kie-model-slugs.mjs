import { config } from "dotenv";
config();

const key = process.env.KIE_KEY;
const baseUrl = "https://api.kie.ai";

const models = [
  "nano-banana-2",
  "nano-banana-2-lite",
  "nano-banana-pro",
  "nano-banana-2-lite-text-to-image",
  "nano-banana-pro-text-to-image",
  "nano-banana-2-text-to-image",
  "flux-dev",
  "flux-dev-image",
  "flux-dev-text-to-image",
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
      callBackUrl: "https://studio.helmies.fi/api/webhooks/generation-complete",
    }),
  });
  const text = await res.text();
  const ok = text.includes('"taskId"') || text.includes('"code":200');
  console.log(`${ok ? "✅" : "❌"} ${model}: ${text.substring(0, 100)}`);
}