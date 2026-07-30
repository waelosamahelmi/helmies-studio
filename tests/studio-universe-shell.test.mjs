import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../src/app/studio/StudioClient.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/styles/studio-universe.css", import.meta.url), "utf8");
const components = fs.readFileSync(new URL("../src/components/studio/StudioComponents.js", import.meta.url), "utf8");
const generationField = fs.readFileSync(new URL("../src/components/studio/universe/GenerationField.js", import.meta.url), "utf8");

test("production Studio mounts the Command Universe shell", () => {
  assert.match(client, /UniverseShell/);
  assert.match(client, /InstrumentOrbit/);
  assert.match(client, /InstrumentIndex/);
  assert.match(client, /RecentConstellation/);
  assert.match(client, /QUICK/);
});

test("generation state uses an animated synthesis canvas instead of a progress bar", () => {
  assert.match(generationField, /<canvas/);
  assert.match(generationField, /requestAnimationFrame/);
  assert.doesNotMatch(generationField, /progress-bar/);
});

test("Command Universe is spatial on desktop and usable on mobile", () => {
  assert.match(css, /\.universe-orbit/);
  assert.match(css, /\.universe-shell__rings/);
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("primary Studio suggestions and shared result actions contain no emoji", () => {
  const files = [
    "../src/components/studio/modes/OrchestratorMode.js",
    "../src/components/studio/modes/SimpleMode.js",
    "../src/components/studio/StudioComponents.js",
  ].map((file) => fs.readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");
  assert.doesNotMatch(files, /\p{Extended_Pictographic}/u);
});
