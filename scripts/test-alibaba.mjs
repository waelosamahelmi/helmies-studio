import { config } from "dotenv";
config();

const key = process.env.ALIBABA_KEY;
const workspaceId = process.env.ALIBABA_WORKSPACE_ID;
const baseUrl = `https://${workspaceId}.ap-southeast-1.maas.aliyuncs.com`;

console.log("=== Alibaba Config ===");
console.log("Key:", key ? key.substring(0, 15) + "..." : "NOT SET");
console.log("Workspace ID:", workspaceId || "NOT SET");
console.log("Base URL:", baseUrl);

// Test 1: Chat completions (compatible mode)
console.log("\n=== Test 1: Chat Completions (qwen-plus, compatible mode) ===");
try {
  const res = await fetch(`${baseUrl}/compatible-mode/v1/chat/completions`, {
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

// Test 2: Image generation (native DashScope API, async)
console.log("\n=== Test 2: Image Generation (wan2.7-t2i-plus, native API) ===");
try {
  const res = await fetch(`${baseUrl}/api/v1/services/aigc/text2image/image-synthesis`, {
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
  const text = await res.text();
  console.log("Body:", text.substring(0, 800));

  // If we got a task_id, poll for the result
  try {
    const json = JSON.parse(text);
    const taskId = json.output?.task_id || json.task_id;
    if (taskId) {
      console.log("\nTask ID:", taskId);
      console.log("Waiting 5s before polling...");
      await new Promise((r) => setTimeout(r, 5000));
      const pollRes = await fetch(`${baseUrl}/api/v1/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      console.log("Poll status:", pollRes.status);
      console.log("Poll body:", (await pollRes.text()).substring(0, 800));
    }
  } catch {}
} catch (e) {
  console.log("Error:", e.message);
}