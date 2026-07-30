#!/usr/bin/env node
/**
 * verify-wiring — static checks that catch the classes of bug this codebase
 * has actually shipped.
 *
 *   1. Internal <Link href>/router.push targets that have no route.
 *   2. apiFetch/fetch calls to /api/... paths that have no route file.
 *   3. Imports of files that do not exist.
 *   4. Components imported nowhere (dead code).
 *   5. `if (!res.ok)` guards on apiFetch results — always dead, because
 *      apiFetch throws on non-2xx.
 *   6. `!model.durations` / `!m.resolutions` style checks — always false,
 *      the catalog emits arrays.
 *
 * Usage: node scripts/verify-wiring.mjs
 */

import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, relative, resolve, dirname } from "path";

const ROOT = resolve(process.cwd());
const SRC = join(ROOT, "src");
const APP = join(SRC, "app");

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) { if (name !== "node_modules") walk(p); }
    else if (/\.(js|jsx|ts|tsx)$/.test(name) && !name.endsWith(".bak")) files.push(p);
  }
})(SRC);

const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");
const read = (p) => readFileSync(p, "utf8");

/* ── Build the route table from the app directory ─────────────────────── */
const pageRoutes = new Set();
const apiRoutes = new Set();

(function routes(dir, prefix = "") {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      // (group) segments do not appear in the URL
      const seg = /^\(.+\)$/.test(name) ? "" : `/${name}`;
      routes(p, prefix + seg);
    } else if (/^page\.(js|jsx|tsx)$/.test(name)) {
      pageRoutes.add(prefix || "/");
    } else if (/^route\.(js|ts)$/.test(name)) {
      apiRoutes.add(prefix || "/");
    }
  }
})(APP);

/** Does a concrete path match a route, allowing for [param] and [...catchall]? */
function matches(path, table) {
  if (table.has(path)) return true;
  for (const r of table) {
    const rx = new RegExp(
      "^" +
        r
          .replace(/\[\.\.\.[^\]]+\]/g, ".+")
          .replace(/\[[^\]]+\]/g, "[^/]+")
          .replace(/\//g, "\\/") +
        "$",
    );
    if (rx.test(path)) return true;
  }
  return false;
}

const problems = [];
const add = (kind, file, line, msg) => problems.push({ kind, file, line, msg });

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

/* ── Scan ─────────────────────────────────────────────────────────────── */
const importedBy = new Map();

for (const file of files) {
  const src = read(file);
  const f = rel(file);

  /* 1 — internal links */
  for (const m of src.matchAll(/(?:href|router\.push\(|router\.replace\()\s*=?\s*["'`](\/[^"'`?#${}]*)/g)) {
    const path = m[1].replace(/\/$/, "") || "/";
    if (path.startsWith("/api/")) continue;
    if (!matches(path, pageRoutes)) {
      add("dead-link", f, lineOf(src, m.index), `no route for ${path}`);
    }
  }

  /* 2 — api calls */
  for (const m of src.matchAll(/["'`](\/api\/[^"'`?#${}]*)/g)) {
    const path = m[1].replace(/\/$/, "");
    if (!matches(path, apiRoutes)) {
      add("dead-api", f, lineOf(src, m.index), `no route for ${path}`);
    }
  }

  /* 3 — local imports resolve */
  for (const m of src.matchAll(/from\s+["'](@\/[^"']+|\.[^"']+)["']/g)) {
    const spec = m[1];
    const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : resolve(dirname(file), spec);
    const found = [base, `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`,
                   join(base, "index.js"), join(base, "index.ts")]
      .some((c) => existsSync(c) && statSync(c).isFile());
    if (!found) add("bad-import", f, lineOf(src, m.index), `cannot resolve ${spec}`);
    else {
      const key = spec.startsWith("@/") ? `src/${spec.slice(2)}` : rel(base);
      importedBy.set(key, (importedBy.get(key) || 0) + 1);
    }
  }

  /* 5 — dead res.ok guards on apiFetch */
  if (src.includes("apiFetch")) {
    for (const m of src.matchAll(/if\s*\(\s*!\s*(\w*[Rr]es\w*)\.ok\s*\)/g)) {
      add("dead-guard", f, lineOf(src, m.index),
          `if (!${m[1]}.ok) is unreachable — apiFetch throws on non-2xx`);
    }
  }

  /* 6 — array-truthiness checks that are always false */
  for (const m of src.matchAll(/!\s*\w+\.(durations|resolutions|aspectRatios)\b/g)) {
    add("always-false", f, lineOf(src, m.index),
        `!${m[0].slice(1)} is always false — the catalog emits an array`);
  }

  /* extra — hardcoded credit strings */
  for (const m of src.matchAll(/["'`]\d+\s*c["'`]|cost=\{\s*["'`]/g)) {
    add("fake-cost", f, lineOf(src, m.index), `hardcoded cost literal: ${m[0]}`);
  }
}

/* 4 — dead components */
const dead = [];
for (const file of files) {
  const f = rel(file);
  if (!f.startsWith("src/components/")) continue;
  if (!importedBy.has(f) && !importedBy.has(f.replace(/\.jsx?$/, ""))) dead.push(f);
}

/* ── Report ───────────────────────────────────────────────────────────── */
const byKind = {};
for (const p of problems) (byKind[p.kind] ||= []).push(p);

let bad = 0;
const ORDER = ["bad-import", "dead-api", "dead-link", "dead-guard", "always-false", "fake-cost"];
for (const kind of ORDER) {
  const list = byKind[kind];
  if (!list?.length) continue;
  bad += list.length;
  console.log(`\n${kind.toUpperCase()}  (${list.length})`);
  for (const p of list) console.log(`  ${p.file}:${p.line}  ${p.msg}`);
}

if (dead.length) {
  console.log(`\nUNREFERENCED COMPONENTS  (${dead.length})`);
  for (const d of dead.sort()) console.log(`  ${d}`);
}

console.log(`\nroutes: ${pageRoutes.size} pages, ${apiRoutes.size} api`);
console.log(`issues: ${bad}   unreferenced: ${dead.length}`);
process.exit(bad > 0 ? 1 : 0);
