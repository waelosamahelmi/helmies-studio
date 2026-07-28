import { config } from "dotenv";
config();

const key = process.env.ALIBABA_KEY;
const workspaceId = process.env.ALIBABA_WORKSPACE_WORKSPACE_ID || process.env.ALIBABA_WORKSPACE_ID;
const compatBaseUrl = workspaceId
  ? `https://${workspaceId}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1`
  : "https://dashscope.aliyuncs.com/compatible-mode/v1";
const nativeBaseUrl = "https://dashscope.aliyuncs.com/api/v1";

console.log("=== Alibaba Config ===");
console.log("Key:", key ? key.substring(0, 10) + "..." : "NOT SET");
console.log("Workspace ID:", workspaceId || "NOT SET");

// Test 1: Chat completions via OpenAI-compatible mode (should work per docs)
console.log("\n=== Test 1: Chat Completions (qwen-plus, compatible mode) ===");
try {
  const res = await fetch(`${compatBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "qwen-plus",
      messages: [{ role: "user", content: "Say hello in one word" }],
      max_tokens: 20,
    }),
  });
  console.log("Status:", res.status);
  console.log("Body:", (await res.text()).substring(0, 500));
} catch (e) {
  console.log("Error:", e.message);
}

// Test 2: Image generation via DashScope native API
console.log("\n=== Test 2: Image Generation (qwen-image, native API) ===");
try {
  const res = await fetch(`${nativeBaseUrl}/services/aigc/text2image/image-synthesis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: "wan2.7-t2i-plus",
      input: {
        prompt: "A cute cat sitting on a windowsill, watercolor style",
      },
      parameters: {
        size: "1024*1024",
        n: 1,
      },
    }),
  });
  console.log("Status:", res.status);
  console.log("Body:", (await res.text()).substring(0, 800));
} catch (e) {
  console.log("Error:", e.message);
}

// Test 3: Video generation via DashScope native API
console.log("\n=== Test 3: Video Generation (wan-2.6-t2v, native API) ===");
try {
  const res = await fetch(`${nativeBaseUrl}/services/aigc/video-generation/video-synthesis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: "wan2.2-t2v-plus",
      input: {
        prompt: "A cat playing with a ball of yarn",
      },
      parameters: {
        size: "1280*720",
        duration: 5,
      },
    }),
  });
  console.log("Status:", res.status);
  console.log("Body:", (await res.text()).substring(0, 800));
} catch (e) {
  console.log("Error:", e.message);
}