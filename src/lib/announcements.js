import prisma from "@/lib/prisma";

/* ══════════════════════════════════════════════════════════════════════════
   ANNOUNCEMENT CAMPAIGNS  (EDITSv1 Phase E8 Task E8.1)
   ──────────────────────────────────────────────────────────────────────────
   One place that decides which campaigns a given viewer should see, so the
   public route, the popup component and the admin preview can never drift
   apart on the answer.

   What this replaces: /api/announcements used to filter on `isActive` plus
   the date window and nothing else. `audience` was written by the admin form
   on every create and READ BY NOBODY — every announcement went to every
   viewer, whoever it was aimed at.

   Two deliberate choices worth knowing about:

   1. The audience match is an EXCLUSION list (`notIn`), not an inclusion
      list. Rows written before this phase carry an older vocabulary
      ("free" / "paid"), and under the ignored-audience behaviour they were
      visible to everyone. An inclusion list would have retired all of them
      the moment this shipped. Excluding only the audience that is
      definitely wrong keeps unknown values fail-open — visible — which is
      what those rows already did.

   2. Nothing here ever lets `undefined` into a `where` clause. Prisma DROPS
      an undefined field rather than matching nothing, which silently WIDENS
      the query — the exact failure mode that once made a delete route wipe
      every workflow a user owned (see tests/unit/route-params-await.test.mjs).
      For `planTargets: { has: undefined }` that would mean showing a
      plan-only campaign to everyone; for `updateMany({ where: { id:
      undefined } })` it would mean incrementing every row in the table.
      Both are guarded and pinned by tests.
   ══════════════════════════════════════════════════════════════════════════ */

// Style tokens the UI can actually render differently. Before E8 the style
// string was printed raw into a badge, so "warning" and "info" looked
// identical — see the `.hs-announce--*` rules in system.css.
export const STYLES = ["info", "success", "warning", "critical"];

export const PLACEMENTS = ["banner", "modal", "toast"];

export const AUDIENCES = ["all", "anon", "authed"];

export function normalizeAudience(value) {
  return AUDIENCES.includes(value) ? value : "all";
}

export function normalizeStyle(value) {
  return STYLES.includes(value) ? value : "info";
}

export function normalizePlacement(value) {
  return PLACEMENTS.includes(value) ? value : "banner";
}

// Signed-in viewers must not see anon-only campaigns and vice versa.
// Anything else — including a legacy value — stays visible to both.
export function audienceFilter(isAuthed) {
  return { notIn: isAuthed ? ["anon"] : ["authed"] };
}

// `planTargets` empty means "every plan". With a known plan we also match
// campaigns that name it. With no plan at all we must NOT emit
// `has: undefined` (dropped => the plan constraint disappears entirely).
export function planFilter(planSlug) {
  if (typeof planSlug === "string" && planSlug.length > 0) {
    return { OR: [{ planTargets: { isEmpty: true } }, { planTargets: { has: planSlug } }] };
  }
  return { planTargets: { isEmpty: true } };
}

export function viewerWhere({ userId, planSlug, isAuthed, now = new Date() }) {
  const where = {
    isActive: true,
    startDate: { lte: now },
    audience: audienceFilter(!!isAuthed),
    AND: [
      { OR: [{ endDate: null }, { endDate: { gte: now } }] },
      planFilter(planSlug),
    ],
  };

  // Only a real user id can carry a dismissal. `none: { userId: undefined }`
  // would mean "rows nobody has ever dismissed", hiding a live campaign from
  // everyone the moment one person closed it.
  if (typeof userId === "string" && userId.length > 0) {
    where.dismissals = { none: { userId } };
  }

  return where;
}

export async function listForViewer({ userId, planSlug, isAuthed, now } = {}, db = prisma) {
  return db.siteAnnouncement.findMany({
    where: viewerWhere({ userId, planSlug, isAuthed, now }),
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 10,
  });
}

// Idempotent by construction: the compound unique makes a second dismissal
// an update of an existing row rather than a duplicate or a crash.
export async function dismiss(announcementId, userId, db = prisma) {
  if (typeof announcementId !== "string" || !announcementId) {
    throw new Error("dismiss: announcementId is required");
  }
  if (typeof userId !== "string" || !userId) {
    throw new Error("dismiss: userId is required");
  }
  return db.announcementDismissal.upsert({
    where: { announcementId_userId: { announcementId, userId } },
    create: { announcementId, userId },
    update: {},
  });
}

// `updateMany` rather than `update` so an id that no longer exists is a
// no-op instead of a thrown P2025 — a metrics counter must never be able to
// fail a user-facing request.
function bumpCounter(field, id, db) {
  if (typeof id !== "string" || !id) return Promise.resolve({ count: 0 });
  return db.siteAnnouncement.updateMany({
    where: { id },
    data: { [field]: { increment: 1 } },
  });
}

export async function recordImpression(id, db = prisma) {
  return bumpCounter("impressions", id, db);
}

export async function recordClick(id, db = prisma) {
  return bumpCounter("clicks", id, db);
}

// The viewer's plan slug, as plan targeting understands it. A subscription
// row exists from the moment a Stripe customer is created, so an unpaid
// "pending" row must not count as being on that plan.
export async function planSlugForUser(userId, db = prisma) {
  if (typeof userId !== "string" || !userId) return null;
  const sub = await db.subscription.findFirst({ where: { userId } });
  if (!sub) return null;
  if (sub.status !== "active") return null;
  return sub.plan || null;
}
