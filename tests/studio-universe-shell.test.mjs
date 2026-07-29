import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync(new URL("../src/app/studio/StudioClient.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/styles/studio-universe.css", import.meta.url), "utf8");
const components = fs.readFileSync(new URL("../src/components/studio/StudioComponents.js", import.meta.url), "utf8");

test("production Studio mounts the Command Universe shell", () => {
  assert.match(client, /studio--universe/);
  assert.match(client, /studio__universe-orbits/);
  assert.match(client, /studio__universe-status/);
});

test("generation state uses an animated synthesis canvas instead of a progress bar", () => {
  assert.match(components, /studio__synthesis-canvas/);
  assert.match(components, /requestAnimationFrame/);
  assert.doesNotMatch(components, /studio__progress-bar-premium/);
});

test("Command Universe is spatial on desktop and usable on mobile", () => {
  assert.match(css, /\.studio--universe \.studio__side/);
  assert.match(css, /\.studio__universe-orbits/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /prefers-reduced-motion/);
});
