// EDITSv1 Phase E8 Task E8.1 — announcement campaign targeting.
//
// Before this phase `SiteAnnouncement.audience` was WRITTEN by the admin form
// and never READ: /api/announcements filtered on isActive + the date window
// only, so every announcement went to everyone regardless of who it was aimed
// at. These tests pin the query shape that makes targeting real.
//
// The other thing pinned here is the undefined-in-a-where-clause hazard this
// repo has already been bitten by once (see tests/unit/route-params-await.test.mjs):
// Prisma DROPS an undefined field from a `where`, silently WIDENING the query.
// For a counter increment that would mean incrementing every row in the table,
// and for a dismissal filter it would mean "rows nobody has ever dismissed".
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const models = {
    siteAnnouncement: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    announcementDismissal: {
      upsert: vi.fn().mockResolvedValue({ id: "d1" }),
    },
  };
  const prisma = { ...models, $transaction: vi.fn(async (fn) => fn(prisma)) };
  return { default: prisma };
});

import prisma from "@/lib/prisma";
import {
  listForViewer,
  dismiss,
  recordImpression,
  recordClick,
  audienceFilter,
  normalizeAudience,
  PLACEMENTS,
  STYLES,
  AUDIENCES,
} from "@/lib/announcements";

beforeEach(() => vi.clearAllMocks());

/* Every `where` value must be a real value — an undefined anywhere in the
   tree means Prisma quietly drops that constraint. */
function assertNoUndefined(node, path = "where") {
  if (node === undefined) throw new Error(`undefined at ${path}`);
  if (node === null || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node)) assertNoUndefined(v, `${path}.${k}`);
}

describe("vocabulary", () => {
  it("offers the four style tokens the UI can actually render differently", () => {
    expect(STYLES).toEqual(["info", "success", "warning", "critical"]);
  });

  it("offers banner, modal and toast placements", () => {
    expect(PLACEMENTS).toEqual(["banner", "modal", "toast"]);
  });

  it("offers all/anon/authed audiences", () => {
    expect(AUDIENCES).toEqual(["all", "anon", "authed"]);
  });
});

describe("audienceFilter — the filter that was missing entirely", () => {
  it("hides anon-only campaigns from a signed-in viewer", () => {
    expect(audienceFilter(true)).toEqual({ notIn: ["anon"] });
  });

  it("hides authed-only campaigns from a signed-out viewer", () => {
    expect(audienceFilter(false)).toEqual({ notIn: ["authed"] });
  });

  // Deliberately an exclusion list, not an inclusion list: rows written
  // before this phase carry legacy audience values ("free"/"paid"), and
  // those were visible to EVERYONE under the old (ignored-audience)
  // behavior. An inclusion list would silently retire them.
  it("fails open — an unrecognised audience value stays visible to everyone", () => {
    expect(audienceFilter(true).notIn).not.toContain("paid");
    expect(audienceFilter(false).notIn).not.toContain("free");
  });

  it("normalizeAudience maps anything unrecognised back to 'all'", () => {
    expect(normalizeAudience("anon")).toBe("anon");
    expect(normalizeAudience("authed")).toBe("authed");
    expect(normalizeAudience("paid")).toBe("all");
    expect(normalizeAudience(null)).toBe("all");
    expect(normalizeAudience("")).toBe("all");
  });
});

describe("listForViewer — query shape", () => {
  it("filters on isActive, the open date window, and audience", async () => {
    await listForViewer({ userId: "u1", planSlug: "pro", isAuthed: true });

    const arg = prisma.siteAnnouncement.findMany.mock.calls[0][0];
    assertNoUndefined(arg.where);

    expect(arg.where.isActive).toBe(true);
    expect(arg.where.startDate.lte).toBeInstanceOf(Date);
    expect(arg.where.AND).toEqual(
      expect.arrayContaining([
        { OR: [{ endDate: null }, { endDate: { gte: expect.any(Date) } }] },
      ]),
    );
    expect(arg.where.audience).toEqual({ notIn: ["anon"] });
  });

  it("orders by priority first, then newest — so the owner controls what wins", async () => {
    await listForViewer({ userId: "u1", planSlug: "pro", isAuthed: true });
    const arg = prisma.siteAnnouncement.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual([{ priority: "desc" }, { createdAt: "desc" }]);
  });

  it("matches a plan-targeted campaign to the viewer's plan, plus untargeted ones", async () => {
    await listForViewer({ userId: "u1", planSlug: "pro", isAuthed: true });
    const arg = prisma.siteAnnouncement.findMany.mock.calls[0][0];
    expect(arg.where.AND).toEqual(
      expect.arrayContaining([
        { OR: [{ planTargets: { isEmpty: true } }, { planTargets: { has: "pro" } }] },
      ]),
    );
  });

  // `has: undefined` would be DROPPED, turning "untargeted campaigns only"
  // into "every campaign, including ones aimed at a plan this viewer is not on".
  it("never sends `has: undefined` when the viewer has no plan", async () => {
    await listForViewer({ userId: "u1", planSlug: null, isAuthed: true });
    const arg = prisma.siteAnnouncement.findMany.mock.calls[0][0];
    assertNoUndefined(arg.where);
    expect(arg.where.AND).toEqual(
      expect.arrayContaining([{ planTargets: { isEmpty: true } }]),
    );
    expect(JSON.stringify(arg.where)).not.toContain('"has"');
  });

  it("excludes rows this signed-in viewer has already dismissed", async () => {
    await listForViewer({ userId: "u1", planSlug: "pro", isAuthed: true });
    const arg = prisma.siteAnnouncement.findMany.mock.calls[0][0];
    expect(arg.where.dismissals).toEqual({ none: { userId: "u1" } });
  });

  // `none: { userId: undefined }` means "rows with NO dismissals at all" —
  // it would hide a campaign from an anonymous visitor the moment any
  // signed-in user dismissed it.
  it("applies no dismissal filter for an anonymous viewer", async () => {
    await listForViewer({ userId: null, planSlug: null, isAuthed: false });
    const arg = prisma.siteAnnouncement.findMany.mock.calls[0][0];
    assertNoUndefined(arg.where);
    expect(arg.where.dismissals).toBeUndefined();
    expect(arg.where.audience).toEqual({ notIn: ["authed"] });
  });
});

describe("dismiss — idempotent by construction", () => {
  it("upserts on the (announcementId, userId) compound unique", async () => {
    await dismiss("a1", "u1");
    const arg = prisma.announcementDismissal.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ announcementId_userId: { announcementId: "a1", userId: "u1" } });
    expect(arg.create).toEqual({ announcementId: "a1", userId: "u1" });
    expect(arg.update).toEqual({});
  });

  it("refuses a blank id or user rather than writing a junk row", async () => {
    await expect(dismiss("", "u1")).rejects.toThrow();
    await expect(dismiss("a1", null)).rejects.toThrow();
    expect(prisma.announcementDismissal.upsert).not.toHaveBeenCalled();
  });
});

describe("counters — atomic, and never table-wide", () => {
  it("increments impressions atomically for exactly one id", async () => {
    await recordImpression("a1");
    const arg = prisma.siteAnnouncement.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "a1" });
    expect(arg.data).toEqual({ impressions: { increment: 1 } });
  });

  it("increments clicks atomically for exactly one id", async () => {
    await recordClick("a1");
    const arg = prisma.siteAnnouncement.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "a1" });
    expect(arg.data).toEqual({ clicks: { increment: 1 } });
  });

  // updateMany({ where: { id: undefined } }) matches EVERY ROW. A metrics
  // counter is not worth corrupting the whole table for.
  it("no-ops on a missing id instead of incrementing every row in the table", async () => {
    expect(await recordImpression(undefined)).toEqual({ count: 0 });
    expect(await recordClick(null)).toEqual({ count: 0 });
    expect(await recordImpression("")).toEqual({ count: 0 });
    expect(prisma.siteAnnouncement.updateMany).not.toHaveBeenCalled();
  });
});
