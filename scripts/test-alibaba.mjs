import { config } from "dotenv";
config();

const key = process.env.ALIBABA_KEY;
const workspaceId = process.env.ALIBABA_WORKSPACE_ID;
const baseUrl = workspaceId
  ? `https://${workspaceId}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1`
  : "https://dashscope.aliyuncs.com/compatible-mode/v1";

console.log("=== Alibaba Config ===");
console.log("Key:", key ? key.substring(0, 10) + "..." : "NOT SET");
console.log("Workspace ID:", workspaceId || "NOT SET");
console.log("Base URL:", baseUrl);

// Test 1: Image generation (synchronous)
console.log("\n=== Test: Image Generation (qwen-image) ===");
try {
  const res = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "qwen-image",
      input: {
        prompt: "A cute cat sitting on a windowsill, watercolor style",
        aspect_ratio: "1:1",
      },
    }),
  });
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Body:", text.substring(0, 800));
} catch (e) {
  console.log("Error:", e.message);
}

// Test 2: Text-to-video generation (async task)
console.log("\n=== Test: Video Generation (wan-2.6-t2v) ===");
try {
  const res = await fetch(`${baseUrl}/video/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "wan-2.6-t2v",
      input: {
        prompt: "A cat playing with a ball of yarn",
        aspect_ratio: "16:9",
        duration: 5,
      },
    }),
  });
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Body:", text.substring(0, 800));

  // If we got a task_id, poll once after a few seconds
  try {
    const json = JSON.parse(text);
    const taskId = json.task_id || json.id || json.output?.task_id;
    if (taskId) {
      console.log("\nTask ID:", taskId);
      console.log("Waiting 5s before polling...");
      await new Promise((r) => setTimeout(r, 5000));
      const pollRes = await fetch(`${baseUrl}/video/generations/${taskId}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      console.log("Poll status:", pollRes.status);
      console.log("Poll body:", (await pollRes.text()).substring(0, 500));
    }
  } catch {}
} catch (e) {
  console.log("Error:", e.message);
}