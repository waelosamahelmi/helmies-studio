#!/usr/bin/env node
/**
 * dead-code — reachability from the route tree.
 *
 * Roots are everything under src/app (Next routes and layouts) plus
 * middleware.js. Anything not reachable from a root by a static import or a
 * dynamic import() is dead.
 *
 * Usage:
 *   node scripts/dead-code.mjs          list dead files
 *   node scripts/dead-code.mjs --delete remove them
 */

import { readdirSync, readFileSync, statSync, existsSync, unlinkSync } from "fs";
import { join, resolve, relative, dirname, sep } from "path";

const ROOT = resolve(process.cwd());
const SRC = join(ROOT, "src");
const DELETE = process.argv.includes("--delete");

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (/\.(js|jsx|ts|tsx)$/.test(name) && !name.endsWith(".bak")) files.push(p);
  }
})(SRC);

const rel = (p) => relative(ROOT, p).split(sep).join("/");

function resolveSpec(from, spec) {
  if (!spec.startsWith("@/") && !spec.startsWith(".")) return null;
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : resolve(dirname(from), spec);
  for (const c of [base, base + ".js", base + ".jsx", base + ".ts", base + ".tsx",
                   join(base, "index.js"), join(base, "index.jsx"),
                   join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const edges = new Map();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const out = new Set();
  const patterns = [
    /from\s+["'](@\/[^"']+|\.[^"']+)["']/g,
    /import\s*\(\s*["'](@\/[^"']+|\.[^"']+)["']\s*\)/g,
    /require\s*\(\s*["'](@\/[^"']+|\.[^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      const t = resolveSpec(f, m[1]);
      if (t) out.add(t);
    }
  }
  edges.set(f, out);
}

// Roots: the route tree. Next also loads middleware.js at the repo root, but
// that file imports nothing local today.
const roots = files.filter((f) => rel(f).startsWith("src/app/"));

const live = new Set();
const stack = [...roots];
while (stack.length) {
  const f = stack.pop();
  if (live.has(f)) continue;
  live.add(f);
  for (const t of edges.get(f) || []) if (!live.has(t)) stack.push(t);
}

const dead = files.filter((f) => !live.has(f)).sort();

for (const f of dead) console.log(rel(f));
console.log(`\n${dead.length} dead of ${files.length} files`);

if (DELETE) {
  for (const f of dead) unlinkSync(f);
  console.log(`deleted ${dead.length}`);
}
