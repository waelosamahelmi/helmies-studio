import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the real Studio shell is composed from Command Universe primitives", () => {
  const source = read("src/app/studio/StudioClient.js");
  for (const name of ["UniverseShell", "InstrumentOrbit", "InstrumentIndex", "RecentConstellation", "CommandSurface"]) assert.match(source, new RegExp(name));
  assert.doesNotMatch(source, /studio__side(?:\s|"|--)/);
});

test("instrument orbit exposes real route links as well as client state", () => {
  const source = read("src/components/studio/universe/InstrumentOrbit.js");
  assert.match(source, /<Link/);
  assert.match(source, /href={`\/studio\/\${tool\.id}`}/);
});

test("canonical creation system includes model, reference, prompt, generation, and result surfaces", () => {
  const source = read("src/components/studio/universe/CreationWorkspace.js");
  for (const name of ["ModelBrowser", "ReferenceConstellation", "PromptDock", "GenerationField", "GenerationResult", "ContextInspector"]) assert.match(source, new RegExp(name));
});

test("model browser presents artwork and provider schema intelligence", () => {
  const source = read("src/components/studio/universe/ModelBrowser.js");
  for (const field of ["backgroundImage", "provider", "resolutions", "durations", "aspectRatios", "pricingBasis", "requirements"]) assert.match(source, new RegExp(field));
});

test("active legacy-backed model cards also render catalog artwork and capabilities", () => {
  const source = read("src/components/studio/StudioComponents.js");
  assert.match(source, /backgroundImage/);
  assert.match(source, /aspectRatios/);
  assert.match(source, /resolutions/);
  assert.match(source, /durations/);
});

test("generation field is canvas based and has no progress bar", () => {
  const source = read("src/components/studio/universe/GenerationField.js");
  assert.match(source, /<canvas/);
  assert.match(source, /ResizeObserver/);
  assert.match(source, /requestAnimationFrame/);
  assert.doesNotMatch(source, /progress-bar|type=["']range["']/);
});

test("command surface remains unmounted until explicitly opened", () => {
  const source = read("src/components/studio/universe/CommandSurface.js");
  assert.match(source, /if \(!open\) return null/);
});

test("all routed creation studios use the canonical Universe workspace", () => {
  const files = ["ImageStudioV2.js", "VideoStudioV2.js", "AudioStudioV2.js", "CinemaStudioV2.js", "LipSyncStudioV2.js", "RecastStudioV2.js", "InfluencerStudioV2.js", "MarketingStudioV2.js", "MotionStudioV2.js", "AvatarStudio.js", "VideoEditStudio.js", "MusicStudio.js", "ClippingStudioV2.js"];
  for (const file of files) assert.match(read(`src/components/studio/${file}`), /CreationWorkspace/);
});

test("specialized Studio routes use the Universe spatial contract without flattening their workflows", () => {
  const source = read("src/app/studio/StudioClient.js");
  assert.match(source, /SpecializedWorkspace/);
  for (const tool of ["agent", "director", "canvas", "workflows", "assets", "brands", "projects"]) assert.match(source, new RegExp(`tool="${tool}"`));
});
