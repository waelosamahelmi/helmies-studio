import { describe, it, expect, vi, beforeEach } from "vitest";

// agents.js must route agent-run debits/refunds through the wallet ledger
// (debitWallet/refundCredits), not the legacy User.credits column — the old
// private debitCredits/creditUser helpers wrote only User.credits, which
// session.js's syncUserCreditsFromWallet silently reverted on the user's
// next request, making agent runs effectively free.

vi.mock("@/lib/prisma", () => {
  const models = {
    agentRun: { create: vi.fn(), update: vi.fn() },
    generation: { create: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    creditTransaction: { create: vi.fn() },
    modelPricing: { findUnique: vi.fn() },
  };
  const prisma = { ...models, $transaction: vi.fn(async (fn) => fn(prisma)) };
  return { default: prisma };
});

vi.mock("@/lib/wallet", () => ({
  getWallet: vi.fn(),
  debitWallet: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("@/lib/security", () => ({
  detectAbuse: vi.fn(),
}));

// The heuristic plan (no OPENROUTER_KEY in the unit test env) routes a
// generic message to a single "image" step, which executeStep dispatches
// through @/lib/generation.
vi.mock("@/lib/generation", () => ({
  generateImage: vi.fn(),
  generateI2I: vi.fn(),
  generateVideo: vi.fn(),
  generateI2V: vi.fn(),
  processLipSync: vi.fn(),
  generateAudio: vi.fn(),
  processRecast: vi.fn(),
  runClipping: vi.fn(),
  runMotionGraphics: vi.fn(),
  generateMarketingAd: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { getWallet, debitWallet, refundCredits } from "@/lib/wallet";
import { detectAbuse } from "@/lib/security";
import { generateImage } from "@/lib/generation";
import { executeAgentRun, executeAgentRunStream } from "@/lib/agents";

// No keyword matches video/audio/website/marketing/code — buildHeuristicPlan
// falls through to a single "image" step, fallback cost 2 credits.
const USER_MESSAGE = "Create a hero shot";
const EXPECTED_SUMMARY = "Heuristic plan: 1 step(s)";
const EXPECTED_TOTAL = 2;

async function drainStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
  }
  return buf
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice(6)));
}

beforeEach(() => {
  vi.clearAllMocks();
  detectAbuse.mockResolvedValue({ flagged: false });
  prisma.modelPricing.findUnique.mockResolvedValue(null);
  prisma.agentRun.create.mockResolvedValue({ id: "run1" });
  prisma.agentRun.update.mockResolvedValue({});
  prisma.generation.create.mockResolvedValue({});
  prisma.user.findUnique.mockResolvedValue({ credits: 100 });
  getWallet.mockResolvedValue({ available: 1000 });
  debitWallet.mockResolvedValue({});
  refundCredits.mockResolvedValue({});
});

describe("executeAgentRun — wallet ledger debit", () => {
  it("debits the wallet for the plan total, tagged with the agent run id — not User.credits", async () => {
    generateImage.mockResolvedValue({ url: "https://cdn.example/img.png" });

    const result = await executeAgentRun("u1", USER_MESSAGE, {});

    expect(result.success).toBe(true);
    expect(debitWallet).toHaveBeenCalledTimes(1);
    const [userId, amount, description, referenceId] = debitWallet.mock.calls[0];
    expect(userId).toBe("u1");
    expect(amount).toBe(EXPECTED_TOTAL);
    expect(description).toContain(EXPECTED_SUMMARY);
    expect(referenceId).toBe("agent:run1");

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.creditTransaction.create).not.toHaveBeenCalled();
  });

  it("refunds the ceil'd remainder to the same reference when the only step fails", async () => {
    generateImage.mockRejectedValue(new Error("boom"));

    const result = await executeAgentRun("u1", USER_MESSAGE, {});

    expect(result.success).toBe(false);
    expect(refundCredits).toHaveBeenCalledTimes(1);
    const [userId, amount, referenceId, reason] = refundCredits.mock.calls[0];
    expect(userId).toBe("u1");
    expect(amount).toBe(EXPECTED_TOTAL);
    expect(referenceId).toBe("agent:run1");
    expect(reason).toBe("Agent run partial failure");

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.creditTransaction.create).not.toHaveBeenCalled();
  });
});

describe("executeAgentRunStream — wallet ledger debit", () => {
  it("debits the wallet before streaming steps — not User.credits", async () => {
    generateImage.mockResolvedValue({ url: "https://cdn.example/img.png" });

    const { stream } = await executeAgentRunStream("u1", USER_MESSAGE, {});
    await drainStream(stream);

    expect(debitWallet).toHaveBeenCalledTimes(1);
    const [userId, amount, description, referenceId] = debitWallet.mock.calls[0];
    expect(userId).toBe("u1");
    expect(amount).toBe(EXPECTED_TOTAL);
    expect(description).toContain(EXPECTED_SUMMARY);
    expect(referenceId).toBe("agent:run1");
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("refunds via the wallet ledger when the streamed run fails", async () => {
    generateImage.mockRejectedValue(new Error("boom"));

    const { stream } = await executeAgentRunStream("u1", USER_MESSAGE, {});
    const events = await drainStream(stream);

    const complete = events.find((e) => e.type === "run_complete");
    expect(complete.success).toBe(false);

    expect(refundCredits).toHaveBeenCalledTimes(1);
    const [userId, amount, referenceId, reason] = refundCredits.mock.calls[0];
    expect(userId).toBe("u1");
    expect(amount).toBe(EXPECTED_TOTAL);
    expect(referenceId).toBe("agent:run1");
    expect(reason).toBe("Agent run partial failure");

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.creditTransaction.create).not.toHaveBeenCalled();
  });
});
