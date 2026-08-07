import "dotenv/config";
import { resolveProvider, submitOnly } from "./src/lib/providers.js";
const model = "elevenlabs/text-to-speech-multilingual-v2";
const p = await resolveProvider(model);
const voices = ["21m00Tcm4TlvDq8ikWAM", "Rachel", "alloy", "default"];
for (const v of voices) {
  try {
    const r = await submitOnly(p, model, { model, text: "Helmies Studio. Create anything you can imagine.", prompt: "Helmies Studio. Create anything you can imagine.", voiceId: v });
    console.log(`ACCEPTED voiceId="${v}" -> ${r.requestId || "immediate"}`);
    break;
  } catch (e) { console.log(`rejected voiceId="${v}"`); }
}
process.exit(0);
