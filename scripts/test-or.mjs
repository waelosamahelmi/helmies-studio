import { config } from "dotenv";
config();

const key = process.env.OPENROUTER_KEY;
console.log("Key:", key?.substring(0, 12) + "...", "len:", key?.length);

const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "HTTP-Referer": "https://studio.helmies.fi",
    "X-Title": "Helmies Studio",
  },
  body: JSON.stringify({
    model: "google/gemini-2.5-flash-openai",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Say hello in one word" },
    ],
    max_tokens: 50,
    stream: false,
  }),
});

console.log("Status:", res.status);
console.log("Body:", (await res.text()).substring(0, 800));