import { describe, it, expect, vi } from "vitest";
import { normalizeAttachTo, attachGenerationToEntity } from "@/lib/entity-attach";

const entity = (over = {}) => ({
  id: "e1", userId: "u1", kind: "environment", status: "draft", references: [], ...over,
});

function db(row) {
  return {
    studioEntity: {
      findFirst: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...row, ...data })),
    },
  };
}

const gen = (over = {}) => ({
  id: "g1", userId: "u1", outputUrl: "https://cdn/x.png",
  params: { attachTo: { entityId: "e1", kind: "wide", label: "Master" } }, ...over,
});

describe("a render finds its way home without a browser", () => {
  it("attaches the finished image to the entity it was made for", async () => {
    // The whole point: this used to happen in the tab, after a poll, so
    // navigating away produced a render that completed, was paid for, and
    // went nowhere.
    const prisma = db(entity());
    await attachGenerationToEntity(prisma, gen());
    const refs = prisma.studioEntity.update.mock.calls[0][0].data.references;
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ url: "https://cdn/x.png", kind: "wide", source: "generated" });
  });

  it("does not attach the same render twice when the worker retries", async () => {
    const prisma = db(entity({ references: [{ url: "https://cdn/x.png", kind: "wide" }] }));
    await attachGenerationToEntity(prisma, gen());
    expect(prisma.studioEntity.update).not.toHaveBeenCalled();
  });

  it("refuses a kind the entity does not accept", async () => {
    // "face_front" on a room would be filed under an angle the selector
    // reaches for and never find what it expects.
    const prisma = db(entity());
    await attachGenerationToEntity(prisma, gen({ params: { attachTo: { entityId: "e1", kind: "face_front" } } }));
    expect(prisma.studioEntity.update).not.toHaveBeenCalled();
  });

  it("drops a render that lands after the identity was locked", async () => {
    // Otherwise a late arrival silently rewrites a character mid-production.
    const prisma = db(entity({ status: "locked" }));
    await attachGenerationToEntity(prisma, gen());
    expect(prisma.studioEntity.update).not.toHaveBeenCalled();
  });

  it("cannot attach to somebody else's entity", async () => {
    const prisma = db(null); // findFirst is userId-scoped, so a miss is a miss
    await attachGenerationToEntity(prisma, gen({ userId: "someone-else" }));
    expect(prisma.studioEntity.update).not.toHaveBeenCalled();
  });

  it("does nothing at all for a generation with no attach intent", async () => {
    const prisma = db(entity());
    await attachGenerationToEntity(prisma, gen({ params: {} }));
    expect(prisma.studioEntity.findFirst).not.toHaveBeenCalled();
  });

  it("never throws — an attach failure must not sink the money path", async () => {
    const prisma = { studioEntity: { findFirst: vi.fn().mockRejectedValue(new Error("db gone")) } };
    await expect(attachGenerationToEntity(prisma, gen())).resolves.toBeNull();
  });

  it("rejects a malformed intent", () => {
    expect(normalizeAttachTo(null)).toBeNull();
    expect(normalizeAttachTo({ entityId: "e1" })).toBeNull();
    expect(normalizeAttachTo({ kind: "wide" })).toBeNull();
    expect(normalizeAttachTo({ entityId: "e1", kind: "wide" })).toMatchObject({ entityId: "e1", kind: "wide" });
  });
});
