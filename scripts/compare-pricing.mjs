import { config } from "dotenv";
config();

const key = process.env.OPENROUTER_KEY;

const res = await fetch("https://openrouter.ai/api/v1/models", {
  headers: { Authorization: `Bearer ${key}` },
});
const json = await res.json();
const models = json.data || [];

// Show raw pricing object for a few models
const ids = ["google/gemini-3.6-flash", "deepseek/deepseek-v4-flash", "x-ai/grok-4.5", "anthropic/claude-sonnet-5"];
for (const id of ids) {
  const m = models.find((x) => x.id === id);
  if (m) {
    console.log(`\n${id}:`);
    console.log("  pricing:", JSON.stringify(m.pricing));
  }
}