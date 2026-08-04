// EDITSv1 Phase E8 Task E8.1 — announcement campaigns against the real DB.
//
// The unit suite pins the QUERY SHAPE; this pins the BEHAVIOUR Postgres
// actually produces: the audience filter really excludes rows, plan
// targeting really matches a text[] column, the date window really closes,
// a dismissal really hides a row for one user and not another, and the
// impression/click counters really survive concurrent increments (an
// increment implemented as read-modify-write would lose most of them).
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createUserWithWallet } from "./setup.mjs";
import {
  listForViewer,
  dismiss,
  recordImpression,
  recordClick,
} from "@/lib/announcements";

let prisma;

const DAY = 24 * 60 * 60 * 1000;

async function makeAnnouncement(overrides = {}) {
  return prisma.siteAnnouncement.create({
    data: {
      message: "Something to say",
      isActive: true,
      startDate: new Date(Date.now() - DAY),
      ...overrides,
    },
  });
}

beforeEach(async () => {
  prisma = await resetDb();
});

describe("listForViewer — audience targeting (previously ignored entirely)", () => {
  it("shows an 'all' campaign to both a signed-in and an anonymous viewer", async () => {
    const user = await createUserWithWallet(100);
    const a = await makeAnnouncement({ audience: "all" });

    const authed = await listForViewer({ userId: user.id, planSlug: null, isAuthed: true });
    const anon = await listForViewer({ userId: null, planSlug: null, isAuthed: false });

    expect(authed.map((x) => x.id)).toContain(a.id);
    expect(anon.map((x) => x.id)).toContain(a.id);
  });

  it("hides an 'anon' campaign from a signed-in viewer", async () => {
    const user = await createUserWithWallet(100);
    const a = await makeAnnouncement({ audience: "anon" });

    const authed = await listForViewer({ userId: user.id, planSlug: null, isAuthed: true });
    const anon = await listForViewer({ userId: null, planSlug: null, isAuthed: false });

    expect(authed.map((x) => x.id)).not.toContain(a.id);
    expect(anon.map((x) => x.id)).toContain(a.id);
  });

  it("hides an 'authed' campaign from an anonymous viewer", async () => {
    const user = await createUserWithWallet(100);
    const a = await makeAnnouncement({ audience: "authed" });

    const authed = await listForViewer({ userId: user.id, planSlug: null, isAuthed: true });
    const anon = await listForViewer({ userId: null, planSlug: null, isAuthed: false });

    expect(authed.map((x) => x.id)).toContain(a.id);
    expect(anon.map((x) => x.id)).not.toContain(a.id);
  });

  // A row written before E8 can carry "free"/"paid". Under the old code it
  // was visible to everyone; retiring it silently would be a regression the
  // owner never asked for.
  it("keeps a legacy audience value visible to everyone rather than retiring it", async () => {
    const user = await createUserWithWallet(100);
    const a = await makeAnnouncement({ audience: "paid" });

    const authed = await listForViewer({ userId: user.id, planSlug: null, isAuthed: true });
    const anon = await listForViewer({ userId: null, planSlug: null, isAuthed: false });

    expect(authed.map((x) => x.id)).toContain(a.id);
    expect(anon.map((x) => x.id)).toContain(a.id);
  });
});

describe("listForViewer — plan targeting", () => {
  it("shows an untargeted campaign to every plan", async () => {
    const user = await createUserWithWallet(100);
    const a = await makeAnnouncement({ planTargets: [] });

    const pro = await listForViewer({ userId: user.id, planSlug: "pro", isAuthed: true });
    const none = await listForViewer({ userId: user.id, planSlug: null, isAuthed: true });

    expect(pro.map((x) => x.id)).toContain(a.id);
    expect(none.map((x) => x.id)).toContain(a.id);
  });

  it("shows a plan-targeted campaign only to a viewer on one of those plans", async () => {
    const user = await createUserWithWallet(100);
    const a = await makeAnnouncement({ planTargets: ["pro", "studio"] });

    const pro = await listForViewer({ userId: user.id, planSlug: "pro", isAuthed: true });
    const studio = await listForViewer({ userId: user.id, planSlug: "studio", isAuthed: true });
    const free = await listForViewer({ userId: user.id, planSlug: "free", isAuthed: true });
    const noPlan = await listForViewer({ userId: user.id, planSlug: null, isAuthed: true });

    expect(pro.map((x) => x.id)).toContain(a.id);
    expect(studio.map((x) => x.id)).toContain(a.id);
    expect(free.map((x) => x.id)).not.toContain(a.id);
    expect(noPlan.map((x) => x.id)).not.toContain(a.id);
  });
});

describe("listForViewer — the schedule window", () => {
  it("excludes a campaign that has not started yet", async () => {
    const a = await makeAnnouncement({ startDate: new Date(Date.now() + DAY) });
    const list = await listForViewer({ userId: null, planSlug: null, isAuthed: false });
    expect(list.map((x) => x.id)).not.toContain(a.id);
  });

  it("excludes a campaign whose end date has passed", async () => {
    const a = await makeAnnouncement({ endDate: new Date(Date.now() - 1000) });
    const list = await listForViewer({ userId: null, planSlug: null, isAuthed: false });
    expect(list.map((x) => x.id)).not.toContain(a.id);
  });

  it("includes an open-ended campaign that has started", async () => {
    const a = await makeAnnouncement({ endDate: null });
    const list = await listForViewer({ userId: null, planSlug: null, isAuthed: false });
    expect(list.map((x) => x.id)).toContain(a.id);
  });

  it("excludes a campaign that is switched off", async () => {
    const a = await makeAnnouncement({ isActive: false });
    const list = await listForViewer({ userId: null, planSlug: null, isAuthed: false });
    expect(list.map((x) => x.id)).not.toContain(a.id);
  });
});

describe("listForViewer — ordering", () => {
  it("returns higher priority first, then newest", async () => {
    const low = await makeAnnouncement({ message: "low", priority: 0 });
    const high = await makeAnnouncement({ message: "high", priority: 10 });
    const mid = await makeAnnouncement({ message: "mid", priority: 5 });

    const list = await listForViewer({ userId: null, planSlug: null, isAuthed: false });
    const ids = list.map((x) => x.id);
    expect(ids.indexOf(high.id)).toBeLessThan(ids.indexOf(mid.id));
    expect(ids.indexOf(mid.id)).toBeLessThan(ids.indexOf(low.id));
  });
});

describe("dismiss — per user, persistent, idempotent", () => {
  it("hides the campaign from the user who dismissed it and nobody else", async () => {
    const alice = await createUserWithWallet(100);
    const bob = await createUserWithWallet(100);
    const a = await makeAnnouncement();

    await dismiss(a.id, alice.id);

    const forAlice = await listForViewer({ userId: alice.id, planSlug: null, isAuthed: true });
    const forBob = await listForViewer({ userId: bob.id, planSlug: null, isAuthed: true });

    expect(forAlice.map((x) => x.id)).not.toContain(a.id);
    expect(forBob.map((x) => x.id)).toContain(a.id);
  });

  it("is idempotent — dismissing twice writes exactly one row", async () => {
    const user = await createUserWithWallet(100);
    const a = await makeAnnouncement();

    await dismiss(a.id, user.id);
    await dismiss(a.id, user.id);

    const rows = await prisma.announcementDismissal.findMany({
      where: { announcementId: a.id, userId: user.id },
    });
    expect(rows).toHaveLength(1);
  });

  it("survives a concurrent double-submit without throwing a unique violation", async () => {
    const user = await createUserWithWallet(100);
    const a = await makeAnnouncement();

    const results = await Promise.allSettled([
      dismiss(a.id, user.id),
      dismiss(a.id, user.id),
      dismiss(a.id, user.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);

    const rows = await prisma.announcementDismissal.findMany({
      where: { announcementId: a.id, userId: user.id },
    });
    expect(rows).toHaveLength(1);
  });

  it("deleting a campaign takes its dismissals with it", async () => {
    const user = await createUserWithWallet(100);
    const a = await makeAnnouncement();
    await dismiss(a.id, user.id);

    await prisma.siteAnnouncement.delete({ where: { id: a.id } });

    const rows = await prisma.announcementDismissal.findMany({ where: { announcementId: a.id } });
    expect(rows).toHaveLength(0);
  });
});

describe("counters — atomic under concurrency", () => {
  it("counts every one of 25 concurrent impressions", async () => {
    const a = await makeAnnouncement();
    await Promise.all(Array.from({ length: 25 }, () => recordImpression(a.id)));
    const row = await prisma.siteAnnouncement.findUnique({ where: { id: a.id } });
    expect(row.impressions).toBe(25);
  });

  it("counts every one of 25 concurrent clicks", async () => {
    const a = await makeAnnouncement();
    await Promise.all(Array.from({ length: 25 }, () => recordClick(a.id)));
    const row = await prisma.siteAnnouncement.findUnique({ where: { id: a.id } });
    expect(row.clicks).toBe(25);
  });

  it("an unknown id increments nothing at all — not every row", async () => {
    const a = await makeAnnouncement();
    const b = await makeAnnouncement();

    await recordImpression("no-such-announcement");
    await recordImpression(undefined);
    await recordClick(null);

    const rows = await prisma.siteAnnouncement.findMany({ where: { id: { in: [a.id, b.id] } } });
    for (const row of rows) {
      expect(row.impressions).toBe(0);
      expect(row.clicks).toBe(0);
    }
  });
});
