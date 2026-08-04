// Guard against a whole class of production bug.
//
// Next 15+ hands Route Handlers a PROMISE for `params`. Reading a field off
// it synchronously yields `undefined` — and Prisma DROPS an undefined field
// from a `where` clause rather than matching nothing. In this codebase that
// meant `DELETE /api/workflows/[id]/run` deleted EVERY workflow the caller
// owned, `PATCH` overwrote all of them, and `regen` charged credits against
// the wrong workflow. The failure is silent: no crash, no error, wrong rows.
//
// This test reads the route sources and fails if any dynamic handler
// destructures `params` without awaiting it, so a new route cannot
// reintroduce it.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const API_ROOT = join(process.cwd(), "src", "app", "api");

function routeFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...routeFiles(full));
    else if (entry === "route.js") found.push(full);
  }
  return found;
}

describe("dynamic route handlers await their params", () => {
  const files = routeFiles(API_ROOT);

  it("finds route files to check (guards against a broken glob)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("never destructures params synchronously in a handler signature", () => {
    const offenders = [];

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      // Only handlers that actually receive `params` can have the bug.
      if (!/export async function \w+\s*\([^)]*\{\s*params\s*\}/.test(src)) continue;

      for (const [i, line] of src.split(/\r?\n/).entries()) {
        // `const { id } = params;`  ->  bug.
        // `const { id } = await params;` -> correct.
        if (/=\s*params\s*;/.test(line) && !/await\s+params/.test(line)) {
          offenders.push(`${file.replace(process.cwd(), "")}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(
      offenders,
      `params must be awaited (Next 15+ passes a Promise; an undefined key is DROPPED from a Prisma where clause, silently widening the query):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
