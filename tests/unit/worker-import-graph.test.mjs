import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/* The worker runs under plain `node`. The app's imports do not.
   ──────────────────────────────────────────────────────────────────────────
   scripts/worker.mjs is started by PM2 as "helmies-worker" with no bundler in
   front of it, so everything it can reach must be resolvable by node itself.
   Two things are not:

     1. the "@/..." path alias — a Next/Vite feature node knows nothing about
     2. "next/server" — no ESM export map, unresolvable outside the bundler

   Both had crash-looped the worker in production. The chain was long and
   entirely innocent-looking: worker.mjs -> agent-runner.js ->
   production-step.js -> screenplay-breakdown.js, a module written when it was
   route-only and later reached by the agent. ESM resolves the whole graph
   before executing a line, so one alias five levels down took the process out
   at startup, every time, for 114 restarts.

   Nothing caught it, because vitest.config.mjs defines the `@` alias too — the
   test runner is MORE permissive than the worker's real runtime. That is the
   gap this file closes: it walks the graph the way node would, not the way the
   bundler does.

   If this test fails, do not add an alias to a config. Change the import to a
   relative path with an explicit extension, and if the module you need drags a
   framework in behind it, split the part the worker needs into a *-core.mjs
   (see src/lib/error-id-core.mjs). */

const ENTRY = "scripts/worker.mjs";

// Bare specifiers that plain node cannot resolve even though they are real
// packages: no ESM export map for the subpath.
const UNRESOLVABLE_BARE = [/^next\/server$/, /^next\/navigation$/, /^server-only$/];

const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\b[^;'"]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g;

function resolveRelative(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const c of [base, `${base}.js`, `${base}.mjs`, path.join(base, "index.js")]) {
    if (existsSync(c) && !existsSync(path.join(c, "."))) return c;
    if (existsSync(c)) return c;
  }
  return null;
}

function walkWorkerGraph() {
  const seen = new Set();
  const aliasImports = [];
  const frameworkImports = [];
  const unresolved = [];

  function visit(file) {
    if (seen.has(file)) return;
    seen.add(file);

    let src;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      return;
    }

    IMPORT_RE.lastIndex = 0;
    let m;
    while ((m = IMPORT_RE.exec(src))) {
      const spec = m[1] || m[2];
      if (!spec) continue;
      const where = path.relative(ROOT, file);

      if (spec.startsWith("@/")) {
        aliasImports.push(`${where} -> ${spec}`);
        // follow through the alias so one break does not hide the rest
        const mapped = path.join(ROOT, "src", spec.slice(2));
        for (const c of [mapped, `${mapped}.js`, `${mapped}.mjs`]) {
          if (existsSync(c)) {
            visit(c);
            break;
          }
        }
        continue;
      }

      if (spec.startsWith(".")) {
        const r = resolveRelative(file, spec);
        if (r) visit(r);
        else unresolved.push(`${where} -> ${spec}`);
        continue;
      }

      if (UNRESOLVABLE_BARE.some((re) => re.test(spec))) {
        frameworkImports.push(`${where} -> ${spec}`);
      }
    }
  }

  visit(path.join(ROOT, ENTRY));
  return { seen, aliasImports, frameworkImports, unresolved };
}

describe("the worker's import graph is plain-node resolvable", () => {
  const graph = walkWorkerGraph();

  it("actually walked something (guards against a silently empty scan)", () => {
    expect(graph.seen.size).toBeGreaterThan(20);
  });

  it("reaches no '@/...' alias import", () => {
    expect(
      graph.aliasImports,
      `The alias is a bundler feature; plain node fails with ERR_MODULE_NOT_FOUND ` +
        `"Cannot find package '@/lib'". Use a relative path with an explicit extension:\n  ` +
        graph.aliasImports.join("\n  "),
    ).toEqual([]);
  });

  it("reaches no bundler-only framework module", () => {
    expect(
      graph.frameworkImports,
      `These have no ESM export map and cannot load outside the bundler. Split the ` +
        `part the worker needs into a framework-free *-core.mjs:\n  ` +
        graph.frameworkImports.join("\n  "),
    ).toEqual([]);
  });

  it("has no unresolvable relative import", () => {
    expect(
      graph.unresolved,
      `Relative imports need an explicit extension under node ESM:\n  ` +
        graph.unresolved.join("\n  "),
    ).toEqual([]);
  });
});
