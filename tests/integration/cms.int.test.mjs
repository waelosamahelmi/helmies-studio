// EDITSv1 Phase E8 Task E8.5 — the CMS was broken two ways, silently.
//
// BUG 1: the publish route called cmsRevision.create({ data: { entryId,
// content, status: "published" } }) — but CmsRevision has NO `status`
// field. Every call threw a Prisma validation error, and every call was
// wrapped in `.catch(() => {})`. NO REVISION HAS EVER BEEN WRITTEN in the
// life of this feature, and nobody could tell, because the route still
// answered `{ success: true }`. `createdBy` was never populated either.
//
// BUG 2: the same route ran updateMany({ where: { key, status: "published" } })
// to "drop any sibling with the same key back to draft" — but CmsEntry.key
// is @unique, so a draft and a published row can never coexist under one
// key. That statement could only ever match the row being published, or
// nothing.
//
// The first test below is the one that matters: it fails against the old
// code, because there is nothing in CmsRevision to find.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createUserWithWallet } from "./setup.mjs";
import { publishEntry, getPublishedContent } from "@/lib/cms";

let prisma;

async function makeEntry(over = {}) {
  return prisma.cmsEntry.create({
    data: {
      key: `k-${Math.random().toString(36).slice(2, 10)}`,
      section: "general",
      content: { headline: "Before" },
      ...over,
    },
  });
}

beforeEach(async () => {
  prisma = await resetDb();
});

describe("publishEntry — a revision is actually written", () => {
  it("writes exactly one revision snapshot, with the content that was published", async () => {
    const entry = await makeEntry({ content: { headline: "Ship it" } });

    await publishEntry(entry.id, null);

    const revisions = await prisma.cmsRevision.findMany({ where: { entryId: entry.id } });
    expect(revisions).toHaveLength(1);
    expect(revisions[0].content).toEqual({ headline: "Ship it" });
  });

  it("records who published it", async () => {
    const admin = await createUserWithWallet(0);
    const entry = await makeEntry();

    await publishEntry(entry.id, admin.id);

    const revision = await prisma.cmsRevision.findFirst({ where: { entryId: entry.id } });
    expect(revision.createdBy).toBe(admin.id);
  });

  it("flips the entry to published", async () => {
    const entry = await makeEntry();
    expect(entry.status).toBe("draft");

    const updated = await publishEntry(entry.id, null);
    expect(updated.status).toBe("published");

    const reread = await prisma.cmsEntry.findUnique({ where: { id: entry.id } });
    expect(reread.status).toBe("published");
  });

  it("builds a history — publishing twice leaves two snapshots, newest last", async () => {
    const entry = await makeEntry({ content: { headline: "First" } });
    await publishEntry(entry.id, null);

    await prisma.cmsEntry.update({ where: { id: entry.id }, data: { content: { headline: "Second" } } });
    await publishEntry(entry.id, null);

    const revisions = await prisma.cmsRevision.findMany({
      where: { entryId: entry.id },
      orderBy: { createdAt: "asc" },
    });
    expect(revisions).toHaveLength(2);
    expect(revisions[0].content).toEqual({ headline: "First" });
    expect(revisions[1].content).toEqual({ headline: "Second" });
  });

  // The old code answered { success: true } whether or not anything worked.
  it("reports a missing entry instead of claiming success", async () => {
    await expect(publishEntry("no-such-entry", null)).rejects.toThrow();
  });

  it("takes its revisions with it when the entry is deleted", async () => {
    const entry = await makeEntry();
    await publishEntry(entry.id, null);

    await prisma.cmsEntry.delete({ where: { id: entry.id } });
    expect(await prisma.cmsRevision.count({ where: { entryId: entry.id } })).toBe(0);
  });
});

describe("the original bug, pinned", () => {
  // Proof, not assertion-by-comment: the exact payload the old publish
  // route sent is REJECTED by the schema. That rejection was caught by
  // `.catch(() => {})` while the route answered { success: true }, which is
  // why the failure survived for the whole life of the feature without
  // anyone noticing. If a `status` column is ever added to CmsRevision
  // deliberately, this test fails and whoever added it should delete it.
  it("cmsRevision.create with a `status` field throws — CmsRevision has no such column", async () => {
    const entry = await makeEntry();
    await expect(
      prisma.cmsRevision.create({
        data: { entryId: entry.id, content: entry.content, status: "published" },
      }),
    ).rejects.toThrow();

    expect(await prisma.cmsRevision.count({ where: { entryId: entry.id } })).toBe(0);
  });
});

describe("getPublishedContent — the reader that makes the section mean something", () => {
  it("returns published content for a key", async () => {
    const entry = await makeEntry({ key: "pricing.faq", content: [{ q: "Why?", a: "Because." }] });
    await publishEntry(entry.id, null);

    const content = await getPublishedContent("pricing.faq", "fallback");
    expect(content).toEqual([{ q: "Why?", a: "Because." }]);
  });

  // "Nothing reaches the public site until you publish it" is what the
  // admin panel promises. It has to be true.
  it("returns the fallback for an entry that is still a draft", async () => {
    await makeEntry({ key: "pricing.faq", content: [{ q: "Draft", a: "Not live." }] });
    expect(await getPublishedContent("pricing.faq", "fallback")).toBe("fallback");
  });

  it("returns the fallback for a key that does not exist", async () => {
    expect(await getPublishedContent("nothing.here", "fallback")).toBe("fallback");
  });

  // A page must never white-screen because a CMS lookup had a bad day.
  it("returns the fallback rather than throwing when the lookup fails", async () => {
    const exploding = { cmsEntry: { findUnique: () => Promise.reject(new Error("db down")) } };
    expect(await getPublishedContent("pricing.faq", "fallback", exploding)).toBe("fallback");
  });
});
