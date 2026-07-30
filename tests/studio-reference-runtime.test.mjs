import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const frame = fs.readFileSync(new URL("../src/components/studio/UniverseStudio.js", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../src/app/api/studio/universe/route.js", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("../public/studio-universe-runtime.js", import.meta.url), "utf8");
const studioPage = fs.readFileSync(new URL("../src/app/studio/page.js", import.meta.url), "utf8");
const studioToolPage = fs.readFileSync(new URL("../src/app/studio/[tool]/page.js", import.meta.url), "utf8");

test("Studio renders the exact direction-eight document", () => {
  assert.match(frame, /api\/studio\/universe/);
  assert.match(frame, /title="Helmies Command Universe"/);
  assert.match(route, /studio-design-concepts\.html/);
  assert.match(route, /theme-universe/);
});

test("production routes retain the real React studios instead of the reference prototype", () => {
  assert.match(studioPage, /StudioClient/);
  assert.match(studioToolPage, /StudioClient/);
  assert.doesNotMatch(studioPage, /UniverseStudio/);
  assert.doesNotMatch(studioToolPage, /UniverseStudio/);
});

test("direction-eight runtime connects real account and generation APIs", () => {
  for (const endpoint of ["/api/credits", "/api/models/catalog", "/api/assets", "/api/upload", "/api/generate/async"]) {
    assert.match(runtime, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
  assert.match(runtime, /pollUrl/);
  assert.match(runtime, /AbortController/);
});
