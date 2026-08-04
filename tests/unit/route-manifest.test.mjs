import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// No fast-glob / no new deps — plain node fs, per the Task 2 brief.
const API_ROOT = path.join(process.cwd(), "src", "app", "api");
const MANIFEST_PATH = path.join(process.cwd(), "security", "route-manifest.json");
const METHOD_RE = /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

function walkRouteFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkRouteFiles(full, out);
    } else if (entry.name === "route.js") {
      // Store as a repo-relative, forward-slash path — matches the manifest's "file" field.
      out.push(path.relative(process.cwd(), full).split(path.sep).join("/"));
    }
  }
  return out;
}

function parseExportedMethods(absPath) {
  const content = fs.readFileSync(absPath, "utf8");
  const methods = [];
  for (const m of content.matchAll(METHOD_RE)) methods.push(m[2]);
  return methods;
}

const realRouteFiles = walkRouteFiles(API_ROOT).sort();

describe("route security manifest — security/route-manifest.json", () => {
  it("exists and is a JSON array", () => {
    expect(fs.existsSync(MANIFEST_PATH)).toBe(true);
    const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
    const manifest = JSON.parse(raw);
    expect(Array.isArray(manifest)).toBe(true);
    expect(manifest.length).toBeGreaterThan(0);
  });

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const manifestByFile = new Map(manifest.map((e) => [e.file, e]));

  it("every entry has the required fields with valid types/values", () => {
    const VALID_AUTH = new Set(["public", "user", "admin", "webhook", "cron", "mixed(user+apikey)"]);
    for (const entry of manifest) {
      expect(typeof entry.path, `path missing/invalid on entry for ${entry.file}`).toBe("string");
      expect(typeof entry.file, `file missing/invalid on entry for ${entry.path}`).toBe("string");
      expect(Array.isArray(entry.methods), `methods must be an array on ${entry.file}`).toBe(true);
      expect(VALID_AUTH.has(entry.auth), `invalid auth "${entry.auth}" on ${entry.file}`).toBe(true);
      expect(typeof entry.originCheck, `originCheck missing/invalid on ${entry.file}`).toBe("boolean");
      expect(typeof entry.rateLimit, `rateLimit missing/invalid on ${entry.file}`).toBe("string");
      expect(typeof entry.stateChanging, `stateChanging missing/invalid on ${entry.file}`).toBe("boolean");
      expect(typeof entry.notes, `notes missing/invalid on ${entry.file}`).toBe("string");
    }
  });

  it("has no duplicate file entries", () => {
    const files = manifest.map((e) => e.file);
    const dupes = files.filter((f, i) => files.indexOf(f) !== i);
    expect(dupes).toEqual([]);
  });

  // FAIL condition (a): any route file missing from the manifest.
  it("registers every src/app/api/**/route.js file found on disk", () => {
    const missing = realRouteFiles.filter((f) => !manifestByFile.has(f));
    expect(missing, `route files present on disk but missing from the manifest:\n${missing.join("\n")}`).toEqual([]);
  });

  // FAIL condition (b): any manifest entry points at a nonexistent file.
  it("every manifest entry points at a file that actually exists", () => {
    const dangling = manifest
      .map((e) => e.file)
      .filter((f) => !fs.existsSync(path.join(process.cwd(), f)));
    expect(dangling, `manifest entries pointing at nonexistent files:\n${dangling.join("\n")}`).toEqual([]);
  });

  // The manifest must not also list files that no longer exist under src/app/api
  // (keeps the manifest from silently drifting out of sync after a route is deleted).
  it("has no stale entries for files outside the current route tree", () => {
    const realSet = new Set(realRouteFiles);
    const stale = manifest.map((e) => e.file).filter((f) => !realSet.has(f));
    expect(stale, `manifest entries for files no longer under src/app/api:\n${stale.join("\n")}`).toEqual([]);
  });

  // FAIL condition (c): stateChanging:true + auth:"public" requires a notes justification.
  it("requires a non-empty notes justification for every public state-changing route", () => {
    const unjustified = manifest.filter(
      (e) => e.stateChanging === true && e.auth === "public" && (!e.notes || !e.notes.trim())
    );
    expect(
      unjustified.map((e) => e.file),
      "public + stateChanging entries must carry a notes justification"
    ).toEqual([]);
  });

  // The Task 2 brief names four expected public+stateChanging routes: stripe/webhook,
  // webhooks/*, auth/register, contact. This manifest classifies the two webhooks/*
  // routes as auth:"webhook" (bearer WEBHOOK_SECRET/CRON_SECRET — a distinct manifest
  // enum value, not "public"), and additionally classifies auth/[...nextauth] as
  // auth:"public" (NextAuth's own sign-in/callback endpoints, which must be reachable
  // pre-session and are not in the brief's enumerated list). See task-2-report.md for
  // the full rationale. This is a pinned regression guard, not condition (c) itself —
  // if this set changes, it means a NEW public+stateChanging route was introduced (or
  // reclassified) and needs the same conscious review the four above got.
  //
  // EDITSv1 Phase E8 Task E8.2 added the two announcement-metric routes
  // below, and they got that review. Both are open to anonymous callers
  // because a promotion on a public page is seen mostly by signed-out
  // visitors — counting impressions for them but refusing their clicks
  // would hand the owner a click-through rate whose numerator is
  // systematically missing, which is worse than not measuring. What makes
  // that acceptable is the blast radius: each handler can only add 1 to one
  // integer column on one SiteAnnouncement row. Neither reads anything,
  // returns anything about the campaign, or can reach any user's data.
  // Both are origin-checked (so another site cannot drive them from a
  // visitor's browser) and IP rate-limited via checkAnonLimit. See their
  // manifest notes for the full argument.
  it("the exact set of public+stateChanging routes matches what Task 2 reviewed", () => {
    const EXPECTED_PUBLIC_STATE_CHANGING = new Set([
      "src/app/api/announcements/[id]/click/route.js",
      "src/app/api/announcements/[id]/impression/route.js",
      "src/app/api/auth/[...nextauth]/route.js",
      "src/app/api/auth/register/route.js",
      "src/app/api/contact/route.js",
      "src/app/api/stripe/webhook/route.js",
    ]);
    const actual = new Set(
      manifest.filter((e) => e.stateChanging === true && e.auth === "public").map((e) => e.file)
    );
    expect(actual).toEqual(EXPECTED_PUBLIC_STATE_CHANGING);
  });

  it("every rateLimit value other than 'none' matches a key in security.js's RATE_LIMITS map", () => {
    // Mirrors the RATE_LIMITS map in src/lib/security.js. Kept as a literal list
    // (rather than importing the module) so this test has no next-auth/prisma
    // import chain to mock — it only needs to catch typo'd/renamed keys.
    const KNOWN_RATE_LIMIT_KEYS = new Set([
      "/api/generate/image", "/api/generate/i2i", "/api/generate/marketing", "/api/generate/influencer",
      "/api/generate/video", "/api/generate/i2v", "/api/generate/v2v", "/api/generate/cinema",
      "/api/generate/recast", "/api/generate/motion", "/api/generate/clipping", "/api/generate/lipsync",
      "/api/generate/audio", "/api/generate/async",
      "/api/analyze", "/api/prompt", "/api/agent", "/api/workflow", "/api/workflow/regen",
      "/api/upload", "/api/contact",
    ]);
    const bad = manifest.filter((e) => e.rateLimit !== "none" && !KNOWN_RATE_LIMIT_KEYS.has(e.rateLimit));
    expect(bad.map((e) => `${e.file}: ${e.rateLimit}`)).toEqual([]);
  });

  it("parses exported HTTP methods for every route file without throwing", () => {
    // Sanity check on the extraction regex itself — every real route file must
    // parse cleanly, even ones (like the NextAuth catch-all) that export zero
    // named function handlers.
    for (const f of realRouteFiles) {
      expect(() => parseExportedMethods(path.join(process.cwd(), f))).not.toThrow();
    }
  });

  // THE DURABLE PART (Task 3, final round): every cookie-session
  // state-changing route MUST have verifyOrigin wired — this is the gap the
  // last three review rounds kept finding one bucket at a time (money
  // routes, then agent/director routes, then the remaining CMS/admin/asset
  // routes). Making it a CI-enforced invariant means a NEW state-changing
  // route with auth "user" or "admin" fails this test the moment it's added
  // to the manifest with originCheck left false — it can no longer just be
  // missed in review. The only escape hatch is a conscious one: a notes
  // string starting with "ORIGIN-EXEMPT:" explaining why this specific
  // route doesn't need (or can't have) the check — mixed(user+apikey),
  // public, webhook, and cron routes are a different auth class entirely
  // and are outside this rule's scope, not exempted via the prefix.
  it("every auth:user/admin state-changing route has originCheck:true, unless notes carry an explicit ORIGIN-EXEMPT: justification", () => {
    const inScope = manifest.filter(
      (e) => (e.auth === "user" || e.auth === "admin") && e.stateChanging === true
    );
    const violations = inScope.filter(
      (e) => e.originCheck !== true && !/^ORIGIN-EXEMPT:/.test((e.notes || "").trim())
    );
    expect(
      violations.map((e) => e.file),
      "cookie-session state-changing routes with no origin check and no ORIGIN-EXEMPT: justification:\n" +
        violations.map((e) => e.file).join("\n")
    ).toEqual([]);
  });
});
