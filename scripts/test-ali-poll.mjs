import { config } from "dotenv";
config();

const key = process.env.ALIBABA_KEY;
const baseUrl = `https://${process.env.ALIBABA_WORKSPACE_ID}.ap-southeast-1.maas.aliyuncs.com`;

// Submit a task and poll until complete
console.log("=== Submitting wan2.1-t2i-turbo task ===");
const res = await fetch(`${baseUrl}/api/v1/services/aigc/text2image/image-synthesis`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "X-DashScope-Async": "enable",
  },
  body: JSON.stringify({
    model: "wan2.1-t2i-turbo",
    input: { prompt: "A cute orange cat sitting on a windowsill, watercolor style" },
    parameters: { size: "1024*1024", n: 1 },
  }),
});
const submitBody = await res.json();
console.log("Submit:", JSON.stringify(submitBody).substring(0, 300));

const taskId = submitBody.output?.task_id;
if (!taskId) {
  console.log("No task ID, exiting");
  process.exit(1);
}

console.log("\n=== Polling task:", taskId, "===");
for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const pollRes = await fetch(`${baseUrl}/api/v1/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const pollBody = await pollRes.json();
  const status = pollBody.output?.task_status || "unknown";
  console.log(`Poll ${i + 1}: ${status}`);
  if (status === "SUCCEEDED") {
    console.log("Result:", JSON.stringify(pollBody.output?.results || pollBody, null, 2).substring(0, 800));
    break;
  }
  if (status === "FAILED") {
    console.log("Failed:", JSON.stringify(pollBody, null, 2).substring(0, 500));
    break;
  }
}