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

test("Agent is a native Command Universe workspace instead of a decorated legacy chat", () => {
  const source = read("src/components/studio/modes/OrchestratorMode.js");
  for (const contract of [
    "agent-universe",
    "agent-universe__stage",
    "agent-universe__conversation",
    "agent-universe__context",
    "agent-universe__composer",
    "agent-universe__plan-field",
  ]) assert.match(source, new RegExp(contract));
  assert.doesNotMatch(source, /ChatHeader|ChatInput|ChatFeed|ModelPicker/);
  assert.doesNotMatch(source, /style=\{/);
});

test("every StudioClient destination is accepted by the dynamic Studio route", () => {
  const route = read("src/app/studio/[tool]/page.js");
  const client = read("src/app/studio/StudioClient.js");
  const ids = [...client.matchAll(/\["([^"]+)",\s*"[^"]+",/g)].map((match) => match[1]);
  for (const id of ids) {
    const key = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(route, new RegExp(`(?:^|\\s)(?:["']${key}["']|${key})\\s*:`, "m"), `${id} must be routable`);
  }
});

test("Image Studio composes the canonical workspace directly", () => {
  const source = read("src/components/studio/ImageStudioV2.js");
  assert.match(source, /return\s*\(\s*<CreationWorkspace/);
  assert.doesNotMatch(source, /withUniverseCreation|studio__pane--left|StagedProgress/);
  for (const behavior of ["handleAddRefs", "handleUpload", "handleGenerate", "useCreditCost", "useAsyncGeneration"]) assert.match(source, new RegExp(behavior));
});

test("Video Studio composes the canonical workspace directly", () => {
  const source = read("src/components/studio/VideoStudioV2.js");
  assert.match(source, /return\s*\(\s*<CreationWorkspace/);
  assert.doesNotMatch(source, /withUniverseCreation|studio__pane--left|StagedProgress/);
  for (const behavior of ["handleGenerate", "duration", "resolution", "aspectRatio", "useCreditCost", "useAsyncGeneration"]) assert.match(source, new RegExp(behavior));
});
