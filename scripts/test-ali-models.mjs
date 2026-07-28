import { config } from "dotenv";
config();

const key = process.env.ALIBABA_KEY;
const baseUrl = `https://${process.env.ALIBABA_WORKSPACE_ID}.ap-southeast-1.maas.aliyuncs.com`;

const imageModels = [
  "wan2.1-t2i-turbo",
  "wan2.1-t2i-plus",
  "flux-dev",
  "flux-schnell",
  "qwen-image",
  "qwen-image-plus",
  "stable-diffusion-v3.5",
  "wan2.7-t2i-plus",
  "wan2.7-t2i",
  "wan-2.1-t2i-turbo",
];

for (const model of imageModels) {
  try {
    const res = await fetch(`${baseUrl}/api/v1/services/aigc/text2image/image-synthesis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify({
        model,
        input: { prompt: "a cute cat" },
        parameters: { size: "1024*1024", n: 1 },
      }),
    });
    const text = await res.text();
    const ok = res.ok;
    console.log(`${ok ? "✅" : "❌"} ${model}: ${res.status} — ${text.substring(0, 120)}`);
  } catch (e) {
    console.log(`❌ ${model}: ${e.message}`);
  }
}