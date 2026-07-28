import { config } from "dotenv";
config();

const key = process.env.ALIBABA_KEY;
const baseUrl = `https://${process.env.ALIBABA_WORKSPACE_ID}.ap-southeast-1.maas.aliyuncs.com`;

const videoModels = [
  "wan2.1-t2v-turbo",
  "wan2.1-t2v-plus",
  "wan2.2-t2v-plus",
  "wan-2.6-t2v",
  "wan2.6-t2v",
  "wan2.1-i2v-turbo",
];

for (const model of videoModels) {
  try {
    const res = await fetch(`${baseUrl}/api/v1/services/aigc/video-generation/video-synthesis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify({
        model,
        input: { prompt: "a cat playing" },
        parameters: { size: "1280*720" },
      }),
    });
    const text = await res.text();
    console.log(`${res.ok ? "✅" : "❌"} ${model}: ${res.status} — ${text.substring(0, 120)}`);
  } catch (e) {
    console.log(`❌ ${model}: ${e.message}`);
  }
}