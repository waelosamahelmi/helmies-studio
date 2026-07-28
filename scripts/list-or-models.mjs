import { config } from "dotenv";
config();

const key = process.env.OPENROUTER_KEY;

// List OpenRouter models, filter for gemini/grok/claude/gpt
const res = await fetch("https://openrouter.ai/api/v1/models", {
  headers: { Authorization: `Bearer ${key}` },
});
console.log("Status:", res.status);
const json = await res.json();
const models = json.data || [];
console.log("Total models:", models.length);

// Filter for the ones we care about
const wanted = ["gemini", "grok", "claude", "gpt-4", "gpt-5", "llama"];
for (const w of wanted) {
  const matches = models.filter(m => m.id.toLowerCase().includes(w)).slice(0, 5);
  console.log(`\n=== ${w} ===`);
  for (const m of matches) {
    console.log(`  ${m.id} — ${m.name} (ctx: ${m.context_length})`);
  }
}