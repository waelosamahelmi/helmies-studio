// Dev probe — run a real screenplay through the breakdown prompt and print
// what came back, without spending a credit or touching the database.
//
//   node scripts/script-breakdown-probe.mjs <path-to-script.md> [--json out.json]
//
// llmComplete talks to OpenRouter directly, so this needs only OPENROUTER_KEY.
// Use it whenever SCRIPT_BREAKDOWN_SYSTEM_PROMPT changes: the failure modes
// that matter (splitting one face into two characters, 30-second shots,
// missing continuity links) are only visible against a real script.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { llmComplete } from "../src/lib/providers.js";
import {
  SCRIPT_BREAKDOWN_SYSTEM_PROMPT,
  SCRIPT_BREAKDOWN_RETRY_HINT,
  parseScriptBreakdown,
  breakdownSummary,
  continuityChains,
  allShots,
  coverageWarnings,
} from "../src/lib/script-breakdown.mjs";

const args = process.argv.slice(2);
const scriptPath = args.find((a) => !a.startsWith("--"));
const jsonIndex = args.indexOf("--json");
const jsonOut = jsonIndex !== -1 ? args[jsonIndex + 1] : null;

if (!scriptPath) {
  console.error("usage: node scripts/script-breakdown-probe.mjs <script.md> [--json out.json]");
  process.exit(1);
}

const script = readFileSync(scriptPath, "utf8");
console.log(`script: ${scriptPath} (${script.length} chars)\n`);

const messages = [
  { role: "system", content: SCRIPT_BREAKDOWN_SYSTEM_PROMPT },
  { role: "user", content: script },
];

let breakdown = null;
for (let attempt = 0; attempt < 2 && !breakdown; attempt++) {
  const started = Date.now();
  const reply = await llmComplete(messages, { maxTokens: 32000, temperature: 0.3, timeout: 420000, withMeta: true });
  const text = reply.content || "";
  console.log(`attempt ${attempt + 1}: ${text.length} chars in ${((Date.now() - started) / 1000).toFixed(1)}s (finish=${reply.finishReason})`);
  breakdown = parseScriptBreakdown(text);
  if (!breakdown) {
    if (reply.truncated) {
      // Retrying is pointless — the same request truncates at the same
      // place. This is the signal to break the script into scene-sized
      // passes instead of asking for the whole film in one reply.
      console.error("  -> TRUNCATED at the token ceiling, not malformed. Raw reply written to breakdown-raw.txt");
      writeFileSync("breakdown-raw.txt", text);
      break;
    }
    console.log("  -> did not parse");
    if (attempt === 0) messages.push({ role: "user", content: SCRIPT_BREAKDOWN_RETRY_HINT });
    else writeFileSync("breakdown-raw.txt", text);
  }
}

if (!breakdown) {
  console.error("\nFAILED to parse a breakdown. Raw reply written to breakdown-raw.txt");
  process.exit(1);
}

const warnings = coverageWarnings(breakdown, script);
if (warnings.length) {
  console.log("\n!! COVERAGE WARNINGS");
  for (const w of warnings) console.log(`   ${w}`);
}

const summary = breakdownSummary(breakdown);
console.log(`\n== ${summary.title} ==`);
console.log(breakdown.logline);
console.log(`aspect ${breakdown.aspectRatio} · ${summary.sceneCount} scenes · ${summary.shotCount} shots · ${summary.totalSeconds}s · ${summary.dialogueLineCount} dialogue lines\n`);

console.log("CHARACTERS");
for (const c of summary.characters) {
  const aliases = c.aliases.length ? ` (aka ${c.aliases.join(", ")})` : "";
  console.log(`  ${c.name}${aliases} — ${c.shotCount} shots, ${c.variantCount} variants, speaks=${c.speaks}, needsReference=${c.needsReference}`);
}

console.log("\nENVIRONMENTS");
for (const e of summary.environments) console.log(`  ${e.name}`);

console.log("\nSOUND");
console.log(`  music: ${breakdown.music.description || "(none)"}`);
console.log(`  sfx: ${summary.sfxCues.join(", ") || "(none)"}`);

console.log("\nCONTINUITY CHAINS");
for (const chain of continuityChains(breakdown)) console.log(`  ${chain.join(" -> ")}`);

console.log("\nSHOTS");
for (const shot of allShots(breakdown)) {
  const who = shot.characters.length ? ` [${shot.characters.join(",")}${shot.characterVariant ? `/${shot.characterVariant}` : ""}]` : "";
  console.log(`  ${shot.id} ${shot.type} ${shot.durationSec}s${who} — ${shot.description.slice(0, 110)}`);
  for (const line of shot.dialogue) console.log(`      ${line.character}: "${line.line}"`);
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(breakdown, null, 2));
  console.log(`\nwrote ${jsonOut}`);
}
