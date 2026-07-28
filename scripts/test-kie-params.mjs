import { config } from "dotenv";
config();

const key = process.env.KIE_KEY;
const baseUrl = "https://api.kie.ai";

// Test with exact params from the playground
const tests = [
  { resolution: "1K", aspect_ratio: "1:1" },
  { resolution: "1k", aspect_ratio: "1:1" },
  { resolution: "1K", aspect_ratio: "16:9" },
  { resolution: "2K", aspect_ratio: "1:1" },
];

for (const params of tests) {
  const res = await fetch(`${baseUrl}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "nano-banana-2",
      input: {
        prompt: "A simple red circle on white background",
        ...params,
      },
    }),
  });
  const text = await res.text();
  const ok = text.includes('"taskId"');
  console.log(`${ok ? "✅" : "❌"} res=${params.resolution} ar=${params.aspect_ratio}: ${text.substring(0, 100)}`);

  // If task created, poll for result to check output dimensions
  if (ok) {
    try {
      const json = JSON.parse(text);
      const taskId = json.data?.taskId;
      if (taskId) {
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const pollRes = await fetch(`${baseUrl}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
            headers: { Authorization: `Bearer ${key}` },
          });
          const pollBody = await pollRes.json();
          const status = pollBody.data?.state || "unknown";
          if (status === "completed" || status === "success" || status === "SUCCEEDED") {
            const resultJson = pollBody.data?.resultJson;
            let url = resultJson;
            try { url = JSON.parse(resultJson)?.resultUrls?.[0] || resultJson; } catch {}
            console.log(`  → ${status}: ${String(url).substring(0, 120)}`);
            break;
          }
          if (status === "failed" || status === "fail" || status === "error") {
            console.log(`  → FAILED: ${JSON.stringify(pollBody.data).substring(0, 200)}`);
            break;
          }
        }
      }
    } catch {}
  }
  await new Promise((r) => setTimeout(r, 500));
}