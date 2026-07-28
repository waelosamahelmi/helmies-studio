import { config } from "dotenv";
config();

const key = process.env.KIE_KEY;
console.log("KIE_KEY starts with:", key?.substring(0, 8) + "...");
console.log("KIE_KEY length:", key?.length);

// Test non-streaming
const res = await fetch("https://api.kie.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "HTTP-Referer": process.env.NEXTAUTH_URL || "https://studio.helmies.fi",
    "X-Title": "Helmies Studio",
  },
  body: JSON.stringify({
    model: "google/gemini-2.5-flash-openai",
    messages: [{ role: "user", content: "Say hello in one word" }],
    max_tokens: 100,
    stream: false,
  }),
});

console.log("\n=== NON-STREAMING ===");
console.log("Status:", res.status);
const text = await res.text();
console.log("Body:", text.substring(0, 500));

// Test streaming
const res2 = await fetch("https://api.kie.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "HTTP-Referer": process.env.NEXTAUTH_URL || "https://studio.helmies.fi",
    "X-Title": "Helmies Studio",
  },
  body: JSON.stringify({
    model: "google/gemini-2.5-flash-openai",
    messages: [{ role: "user", content: "Say hello in one word" }],
    max_tokens: 100,
    stream: true,
  }),
});

console.log("\n=== STREAMING ===");
console.log("Status:", res2.status);
const raw = await res2.text();
console.log("Raw response (first 1000 chars):", raw.substring(0, 1000));