import { config } from "dotenv";
config();

const key = process.env.KIE_KEY;

// Test various model name formats
const models = [
  "gemini-3-6-flash",
  "gemini-3-6-flash-openai",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash",
  "grok-4-5",
  "claude-sonnet-5",
  "gpt-5-6",
];

for (const model of models) {
  const res = await fetch("https://api.kie.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Say hello in one word" }],
      max_tokens: 50,
      stream: false,
    }),
  });
  const text = await res.text();
  console.log(`${model} → ${res.status}: ${text.substring(0, 200)}`);
  console.log();
}