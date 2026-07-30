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

test("all routed creation studios use a native Universe workspace", () => {
  for (const file of ["ImageStudioV2.js", "VideoStudioV2.js"]) {
    assert.match(read(`src/components/studio/${file}`), /CreationWorkspace/);
  }
  for (const file of ["AudioStudioV2.js", "CinemaStudioV2.js", "LipSyncStudioV2.js", "RecastStudioV2.js", "InfluencerStudioV2.js", "MarketingStudioV2.js", "MotionStudioV2.js", "ClippingStudioV2.js"]) {
    assert.match(read(`src/components/studio/${file}`), /WorkspaceShell/);
  }
  for (const file of ["AvatarStudio.js", "VideoEditStudio.js", "MusicStudio.js"]) {
    assert.match(read(`src/components/studio/${file}`), /media-lab/);
    assert.doesNotMatch(read(`src/components/studio/${file}`), /withUniverseCreation/);
  }
});

test("specialized Studio routes mount their native spatial workspaces without a flattening wrapper", () => {
  const source = read("src/app/studio/StudioClient.js");
  assert.doesNotMatch(source, /SpecializedWorkspace/);
  for (const component of ["ChatStudio", "DirectorWorkspace", "CanvasWorkspace", "WorkflowBuilder", "AssetLibrary", "BrandKitsView", "ProjectMemory"]) assert.match(source, new RegExp(`<${component}`));
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

test("Canvas is a native spatial Universe editor with canvas generation field", () => {
  const source = read("src/components/studio/CanvasWorkspace.js");
  for (const contract of ["canvas-universe", "canvas-universe__tools", "canvas-universe__artboard", "canvas-universe__inspector", "canvas-universe__dock", "GenerationField"]) assert.match(source, new RegExp(contract));
  assert.doesNotMatch(source, /studio__spinner|TOOL_DEFS[\s\S]*[🖼✏]/);
  for (const behavior of ["undo", "redo", "applyZoom", "compile", "addImageFromUrl", "handleGenerate"]) assert.match(source, new RegExp(behavior));
});

test("shared production tools use a spatial stage, context orbit, and prompt dock", () => {
  const shell = read("src/components/studio/StudioComponents.js");
  for (const contract of ["production-universe", "production-universe__stage", "production-universe__context", "production-universe__dock"]) assert.match(shell, new RegExp(contract));
  assert.doesNotMatch(shell, /studio__pane--inputs|canonical three-pane/);
  for (const file of ["AudioStudioV2.js", "CinemaStudioV2.js", "LipSyncStudioV2.js", "RecastStudioV2.js", "InfluencerStudioV2.js", "MarketingStudioV2.js", "MotionStudioV2.js", "ClippingStudioV2.js"]) assert.doesNotMatch(read(`src/components/studio/${file}`), /withUniverseCreation/);
});

test("remaining build, library, account, and operations pages carry the dark Universe design contract", () => {
  const contracts = [
    ["src/components/studio/DirectorWorkspace.js", "director-universe"],
    ["src/components/studio/WorkflowBuilder.js", "workflow-universe"],
    ["src/components/studio/AssetLibrary.js", "asset-universe"],
    ["src/components/studio/BrandKitsView.js", "brand-universe"],
    ["src/components/studio/ProjectMemory.js", "memory-universe"],
    ["src/app/gallery/page.js", "universe-gallery"],
    ["src/app/settings/page.js", "universe-settings"],
    ["src/components/admin/AdminShell.js", "admin-universe"],
  ];
  for (const [file, contract] of contracts) assert.match(read(file), new RegExp(contract));
  assert.doesNotMatch(read("src/components/admin/AdminShell.js"), /📊|💰|🤖|👥|📝|⚙️/);
});

test("native media labs do not execute the removed CreationWorkspace adapter", () => {
  for (const file of ["AvatarStudio.js", "MusicStudio.js", "VideoEditStudio.js"]) {
    const source = read(`src/components/studio/${file}`);
    assert.doesNotMatch(source, /void CreationWorkspace/);
  }
});
