import { describe, it, expect, vi, beforeEach } from "vitest";

const prisma = {
  generation: { findFirst: vi.fn(), updateMany: vi.fn() },
  generationJob: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
};
const releaseReservation = vi.fn();

vi.mock("@/lib/prisma", () => ({ default: prisma }));
vi.mock("@/lib/wallet", () => ({ releaseReservation }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { cancelGeneration, clearGenerations } = await import("@/lib/generation-control");

beforeEach(() => {
  vi.clearAllMocks();
  prisma.generation.updateMany.mockResolvedValue({ count: 1 });
  prisma.generationJob.updateMany.mockResolvedValue({ count: 1 });
  prisma.generationJob.update.mockResolvedValue({});
  releaseReservation.mockResolvedValue({});
});

const live = { id: "g1", userId: "u1", status: "queued" };

describe("stopping a run", () => {
  it("really cancels one that never reached a provider, and gives the credits back", () => {
    // Nothing ran, so nothing is owed. Release, never settle.
    prisma.generation.findFirst.mockResolvedValue(live);
    prisma.generationJob.findUnique.mockResolvedValue({ id: "j1", status: "queued", providerRequestId: null });
    return cancelGeneration("u1", "g1").then((res) => {
      expect(res.outcome).toBe("cancelled");
      expect(releaseReservation).toHaveBeenCalledWith("u1", "g1");
      expect(prisma.generation.updateMany).toHaveBeenCalled();
    });
  });

  it("does NOT claim to have cancelled one already sent to a provider", async () => {
    // The provider bills us whether or not we are still listening. Saying
    // "cancelled" here is a lie the user finds on their statement.
    prisma.generation.findFirst.mockResolvedValue({ ...live, status: "processing" });
    prisma.generationJob.findUnique.mockResolvedValue({ id: "j1", status: "running", providerRequestId: "req_1" });
    const res = await cancelGeneration("u1", "g1");
    expect(res.outcome).toBe("requested");
    expect(res.message).toMatch(/charged either way/i);
    expect(releaseReservation).not.toHaveBeenCalled();
  });

  it("sets the flag the worker actually reads", async () => {
    prisma.generation.findFirst.mockResolvedValue({ ...live, status: "processing" });
    prisma.generationJob.findUnique.mockResolvedValue({ id: "j1", status: "running", providerRequestId: "req_1" });
    await cancelGeneration("u1", "g1");
    expect(prisma.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cancelRequested: true }) }),
    );
  });

  it("handles the race where the job is dispatched between the read and the write", async () => {
    // updateMany matching zero rows means a worker claimed it first.
    prisma.generation.findFirst.mockResolvedValue(live);
    prisma.generationJob.findUnique.mockResolvedValue({ id: "j1", status: "queued", providerRequestId: null });
    prisma.generationJob.updateMany.mockResolvedValue({ count: 0 });
    const res = await cancelGeneration("u1", "g1");
    expect(res.outcome).toBe("requested");
    expect(releaseReservation).not.toHaveBeenCalled();
  });

  it("says so rather than pretending, when it already finished", async () => {
    prisma.generation.findFirst.mockResolvedValue({ ...live, status: "completed" });
    const res = await cancelGeneration("u1", "g1");
    expect(res.outcome).toBe("too_late");
    expect(releaseReservation).not.toHaveBeenCalled();
  });

  it("cannot touch somebody else's run", async () => {
    prisma.generation.findFirst.mockResolvedValue(null); // the query is userId-scoped
    expect(await cancelGeneration("u1", "not-mine")).toBeNull();
  });
});

describe("clearing failures", () => {
  it("hides rather than deletes", async () => {
    // A failed run is what a refund argument gets settled with.
    await clearGenerations("u1");
    const call = prisma.generation.updateMany.mock.calls[0][0];
    expect(call.data.hiddenAt).toBeInstanceOf(Date);
    expect(call.where.status.in).toEqual(["failed", "cancelled"]);
  });

  it("never hides a run that is still going", async () => {
    // Hiding a live run leaves it running with nothing on screen.
    await clearGenerations("u1");
    const { where } = prisma.generation.updateMany.mock.calls[0][0];
    for (const s of ["queued", "running", "processing", "pending", "completed"]) {
      expect(where.status.in).not.toContain(s);
    }
  });
});
