import { config } from "dotenv";
config();

const key = process.env.KIE_KEY;
const baseUrl = "https://api.kie.ai";

// Test chat via KIE async task API
const chatModels = ["gemini-3-6-flash", "gemini-2.5-pro", "gemini-3-flash", "grok-4-5", "claude-sonnet-5"];

for (const model of chatModels) {
  console.log(`\n=== Testing ${model} via createTask ===`);
  const res = await fetch(`${baseUrl}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      input: {
        messages: [{ role: "user", content: "Say hello in one word" }],
        max_tokens: 50,
      },
    }),
  });
  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Body:", text.substring(0, 400));

  // If we got a task_id, try polling
  try {
    const json = JSON.parse(text);
    const taskId = json.taskId || json.data?.taskId || json.task_id;
    if (taskId) {
      console.log("Task ID:", taskId);
      // Poll a few times
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const pollRes = await fetch(`${baseUrl}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        const pollText = await pollRes.text();
        console.log(`Poll ${i + 1}:`, pollText.substring(0, 400));
        try {
          const pollJson = JSON.parse(pollText);
          const status = pollJson.data?.state || pollJson.state || pollJson.data?.status;
          if (status === "completed" || status === "success") break;
          if (status === "failed" || status === "error") break;
        } catch {}
      }
    }
  } catch {}
}