import { config } from "dotenv";
config();

const key = process.env.OPENROUTER_KEY;

// Check the key info / credits
const res = await fetch("https://openrouter.ai/api/v1/key", {
  headers: { Authorization: `Bearer ${key}` },
});
console.log("Key info status:", res.status);
console.log("Key info:", (await res.text()).substring(0, 500));

// Check credits
const res2 = await fetch("https://openrouter.ai/api/v1/credits", {
  headers: { Authorization: `Bearer ${key}` },
});
console.log("\nCredits status:", res2.status);
console.log("Credits:", (await res2.text()).substring(0, 500));