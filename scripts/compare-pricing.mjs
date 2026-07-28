import { config } from "dotenv";
config();

const key = process.env.OPENROUTER_KEY;

const res = await fetch("https://openrouter.ai/api/v1/models", {
  headers: { Authorization: `Bearer ${key}` },
});
const json = await res.json();
const models = json.data || [];

const ids = [
  "google/gemini-3.6-flash",
  "x-ai/grok-4.5",
  "anthropic/claude-sonnet-5",
  "openai/gpt-4.1-mini",
  "meta-llama/llama-4-scout",
  "deepseek/deepseek-chat",
  "deepseek/deepseek-v3.2-exp",
];

console.log("=== OpenRouter pricing (per 1M tokens) ===\n");
for (const id of ids) {
  const m = models.find((x) => x.id === id);
  if (m) {
    const prompt = (parseFloat(m.pricing?.prompt) || 0).toFixed(4);
    const completion = (parseFloat(m.pricing?.completion) || 0).toFixed(4);
    console.log(`${id}:  input=$${prompt}  output=$${completion}`);
  } else {
    // Find closest match
    const partial = models.find((x) => x.id.startsWith(id.split("/")[0]));
    if (partial) {
      const prompt = (parseFloat(partial.pricing?.prompt) || 0).toFixed(4);
      const completion = (parseFloat(partial.pricing?.completion) || 0).toFixed(4);
      console.log(`${id} (≈ ${partial.id}):  input=$${prompt}  output=$${completion}`);
    } else {
      console.log(`${id}: NOT FOUND`);
    }
  }
}

// Also list all deepseek models
console.log("\n=== All DeepSeek models on OpenRouter ===");
const deepseekModels = models.filter((m) => m.id.startsWith("deepseek/")).slice(0, 10);
for (const m of deepseekModels) {
  const prompt = (parseFloat(m.pricing?.prompt) || 0).toFixed(4);
  const completion = (parseFloat(m.pricing?.completion) || 0).toFixed(4);
  console.log(`${m.id}:  input=$${prompt}  output=$${completion}`);
}