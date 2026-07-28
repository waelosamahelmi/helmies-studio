import { config } from "dotenv";
config();
console.log("OPENROUTER_KEY:", process.env.OPENROUTER_KEY ? process.env.OPENROUTER_KEY.substring(0, 8) + "..." : "NOT SET");
console.log("OPENROUTER_KEY length:", process.env.OPENROUTER_KEY?.length || 0);