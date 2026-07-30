#!/usr/bin/env node
/**
 * parse-check — real syntax validation for JSX/ESM.
 *
 * `node --check` is useless here: it parses these files as ESM and returns 0
 * even for genuinely broken JSX. This uses the TypeScript parser already in
 * node_modules to get actual diagnostics.
 *
 * It also verifies that every named import from a local module resolves to a
 * real export in that module — the failure mode that produces a blank screen
 * with "X is not a function" at runtime.
 *
 * Usage: node scripts/parse-check.mjs [dir]
 */

import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, resolve, relative, dirname } from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
let ts;
try {
  ts = require("typescript");
} catch {
  console.error("typescript is not installed — cannot parse-check");
  process.exit(2);
}

const ROOT = resolve(process.cwd());
const SRC = resolve(process.argv[2] || join(ROOT, "src"));

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

let syntaxErrors = 0;
let importErrors = 0;
const sources = new Map();

/* ── Pass 1: parse ────────────────────────────────────────────────────── */
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );
  sources.set(file, sf);

  // `parseDiagnostics` is internal but stable and is the only way to get
  // syntax errors without a full program.
  const diags = sf.parseDiagnostics || [];
  for (const d of diags) {
    const { line, character } = sf.getLineAndCharacterOfPosition(d.start ?? 0);
    console.log(
      `SYNTAX  ${rel(file)}:${line + 1}:${character + 1}  ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`,
    );
    syntaxErrors++;
  }
}

/* ── Pass 2: collect exports per file ─────────────────────────────────── */
const exportsOf = new Map();

function collectExports(file, sf) {
  const names = new Set();
  let star = false;

  const visit = (node) => {
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) names.add(el.name.text);
      } else if (!node.exportClause) {
        star = true; // export * from "…"
      }
    } else if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableStatement(node)) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      if (node.modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
        names.add("default");
      } else if (ts.isVariableStatement(node)) {
        // Handles `export const a = …` and destructured forms such as
        // `export const { handlers, auth } = NextAuth({…})`, which NextAuth v5
        // uses and which a naive identifier check misses.
        const bind = (name) => {
          if (ts.isIdentifier(name)) names.add(name.text);
          else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
            for (const el of name.elements) {
              if (ts.isBindingElement(el)) bind(el.name);
            }
          }
        };
        for (const d of node.declarationList.declarations) bind(d.name);
      } else if (node.name) {
        names.add(node.name.text);
      }
    } else if (ts.isExportAssignment(node)) {
      names.add("default");
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  exportsOf.set(file, { names, star });
}

for (const [file, sf] of sources) collectExports(file, sf);

/* Resolve a module specifier to a file on disk */
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith("@/") && !spec.startsWith(".")) return null; // package
  const base = spec.startsWith("@/")
    ? join(ROOT, "src", spec.slice(2))
    : resolve(dirname(fromFile), spec);
  for (const c of [base, `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`,
                   join(base, "index.js"), join(base, "index.jsx"),
                   join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return false; // unresolvable
}

/** Follow `export *` chains so barrel files report correctly. */
function hasExport(file, name, seen = new Set()) {
  if (!file || seen.has(file)) return false;
  seen.add(file);
  const info = exportsOf.get(file);
  if (!info) return true; // not parsed (outside src) — assume fine
  if (info.names.has(name)) return true;
  if (!info.star) return false;

  const sf = sources.get(file);
  if (!sf) return false;
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st) && !st.exportClause && st.moduleSpecifier) {
      const target = resolveSpec(file, st.moduleSpecifier.text);
      if (target && hasExport(target, name, seen)) return true;
    }
  }
  return false;
}

/* ── Pass 3: check named imports ──────────────────────────────────────── */
for (const [file, sf] of sources) {
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.moduleSpecifier) continue;
    const spec = st.moduleSpecifier.text;
    const target = resolveSpec(file, spec);
    if (target === null) continue; // node_modules

    const { line } = sf.getLineAndCharacterOfPosition(st.getStart(sf));

    if (target === false) {
      console.log(`IMPORT  ${rel(file)}:${line + 1}  cannot resolve "${spec}"`);
      importErrors++;
      continue;
    }

    const clause = st.importClause;
    if (!clause) continue;

    if (clause.name && !hasExport(target, "default")) {
      console.log(`IMPORT  ${rel(file)}:${line + 1}  "${spec}" has no default export`);
      importErrors++;
    }
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        const want = (el.propertyName || el.name).text;
        if (!hasExport(target, want)) {
          console.log(`IMPORT  ${rel(file)}:${line + 1}  "${spec}" does not export "${want}"`);
          importErrors++;
        }
      }
    }
  }
}

console.log(
  `\nparsed ${files.length} files · ${syntaxErrors} syntax error(s) · ${importErrors} import error(s)`,
);
process.exit(syntaxErrors + importErrors > 0 ? 1 : 0);
