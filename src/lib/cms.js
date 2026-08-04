import prisma from "@/lib/prisma";
import { log } from "@/lib/log";

/* ══════════════════════════════════════════════════════════════════════════
   CMS  (EDITSv1 Phase E8 Task E8.5)
   ──────────────────────────────────────────────────────────────────────────
   Two silent bugs lived in the publish route this replaces.

   1. It called cmsRevision.create({ data: { entryId, content, status } }) —
      and CmsRevision has NO `status` field. Every call threw a Prisma
      validation error, and every call was wrapped in `.catch(() => {})`, so
      the route still answered `{ success: true }`. NO REVISION WAS EVER
      WRITTEN, for the entire life of the feature, and `createdBy` was never
      populated either. Errors are no longer swallowed here.

   2. It ran updateMany({ where: { key, status: "published" } }) to "drop
      any sibling with the same key back to draft" — but `CmsEntry.key` is
      @unique, so a draft and a published row cannot coexist under one key.
      That statement could only ever match the row being published, or
      nothing at all.

   THE MODEL, decided and now written down: ONE ROW PER KEY, carrying a
   status, with CmsRevision as its append-only history. That is what the
   schema already describes (`key @unique`, `status` on the entry, a
   revisions relation) — the publish route was written against a different,
   versioned-rows model that was never built. No schema change is needed to
   make code and schema agree; the sibling-demotion statement simply goes.

   `status` is deliberately NOT added to CmsRevision: publishing is the only
   thing that ever creates one, so the column would read "published" on
   every row forever.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Publish an entry and snapshot it.
 *
 * The status flip and the revision write share one transaction: a history
 * that can silently miss entries is worse than no history, because it looks
 * complete.
 */
export async function publishEntry(id, adminId = null, db = prisma) {
  if (typeof id !== "string" || !id) throw new Error("publishEntry: an entry id is required");

  return db.$transaction(async (tx) => {
    // Throws P2025 if the entry is gone — which the caller surfaces, rather
    // than reporting success for something that did not happen.
    const updated = await tx.cmsEntry.update({
      where: { id },
      data: { status: "published" },
    });

    await tx.cmsRevision.create({
      data: {
        entryId: updated.id,
        content: updated.content,
        createdBy: adminId || null,
      },
    });

    return updated;
  });
}

/**
 * The published content for a key, or `fallback`.
 *
 * This is the reader that makes the admin's CMS section mean something —
 * before it, CmsEntry was written by the admin panel and read by NO page in
 * the entire app, so "nothing reaches the public site until you publish it"
 * was true only in the sense that nothing reached it either way.
 *
 * Never throws. A page must not white-screen because a CMS lookup had a bad
 * day, and a build that prerenders a page without database access must
 * still produce the shipped copy.
 */
export async function getPublishedContent(key, fallback = null, db = prisma) {
  if (typeof key !== "string" || !key) return fallback;
  try {
    const entry = await db.cmsEntry.findUnique({ where: { key } });
    if (!entry || entry.status !== "published") return fallback;
    return entry.content ?? fallback;
  } catch (err) {
    // warn, not error: the page still renders its shipped copy, so this is
    // a degraded read rather than a failure. It fires legitimately during
    // `next build`, where a prerender has no database to reach — which is
    // precisely the case this fallback exists for.
    log.warn("cms_read_fell_back", { key, err });
    return fallback;
  }
}

/**
 * Published content that must be a non-empty array of { q, a } — the shape
 * the pricing FAQ renders and the shape its JSON-LD is built from. A
 * malformed entry falls back rather than rendering an empty accordion or
 * emitting broken structured data.
 */
export async function getPublishedFaq(key, fallback) {
  const content = await getPublishedContent(key, null);
  if (!Array.isArray(content) || content.length === 0) return fallback;
  const clean = content.filter(
    (item) => item && typeof item.q === "string" && typeof item.a === "string",
  );
  return clean.length > 0 ? clean : fallback;
}
