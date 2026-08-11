// Helmies Studio — the 8-character error id, on its own.
//
// This lived in src/lib/api-error.js, which is the right home for it as far
// as a reader is concerned: an error id belongs beside the error envelope.
// But api-error.js imports NextResponse from "next/server", and ESM runs a
// module's whole import list before handing over a single named export — so
// `import { newErrorId } from "./api-error.js"` pulled the entire Next server
// runtime in behind it.
//
// That was invisible while only routes called it. Once the agent reached
// director-planner.js (which needs newErrorId and nothing else from the
// envelope) through screenplay-breakdown.js, the PM2 "helmies-worker"
// process — plain `node`, no bundler — crash-looped at startup on a
// "next/server" it has no use for and cannot resolve.
//
// So the pure part sits here, framework-free, in the same *-core.mjs shape
// the rest of this codebase uses for logic both runtimes share
// (model-catalog-core.mjs, provider-payload-core.mjs, ...). api-error.js
// re-exports it, so every existing `import { newErrorId } from "@/lib/api-error"`
// keeps working unchanged.
import { randomUUID } from "node:crypto";

// 8 chars of a UUID — matches the pre-existing DirectorPlanError id shape
// (src/lib/director-planner.js), which the envelope generalized.
export function newErrorId() {
  return randomUUID().slice(0, 8);
}
