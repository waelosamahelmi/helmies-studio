import { config } from "dotenv";
config();

const key = process.env.KIE_KEY;
const baseUrl = "https://api.kie.ai";

// Test nano-banana via KIE
console.log("=== Test: nano-banana via KIE createTask ===");
const res = await fetch(`${baseUrl}/api/v1/jobs/createTask`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({
    model: "nano-banana",
    input: {
      prompt: "A cinematic flying horse",
      aspect_ratio: "1:1",
    },
    callBackUrl: "https://studio.helmies.fi/api/webhooks/generation-complete",
  }),
});
console.log("Status:", res.status);
const text = await res.text();
console.log("Body:", text.substring(0, 600));

// If we got a task_id, poll
try {
  const json = JSON.parse(text);
  const taskId = json.data?.taskId || json.taskId;
  if (taskId) {
    console.log("\nTask ID:", taskId);
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(`${baseUrl}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const pollBody = await pollRes.json();
      const status = pollBody.data?.state || "unknown";
      console.log(`Poll ${i + 1}: ${status}`);
      if (status === "completed" || status === "success" || status === "SUCCEEDED") {
        console.log("Result:", JSON.stringify(pollBody.data?.resultJson || pollBody, null, 2).substring(0, 800));
        break;
      }
      if (status === "failed" || status === "fail" || status === "error") {
        console.log("Failed:", JSON.stringify(pollBody.data, null, 2).substring(0, 500));
        break;
      }
    }
  }
} catch (e) {
  console.log("Error:", e.message);
}