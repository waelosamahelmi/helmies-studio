import { config } from "dotenv";
config();
const k = process.env.ALIBABA_KEY;
console.log("len:", k?.length);
console.log("first 20:", k?.substring(0, 20));
console.log("last 10:", k?.substring(k?.length - 10));