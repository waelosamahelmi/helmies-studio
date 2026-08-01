import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createUserWithWallet } from "./setup.mjs";

let prisma;
beforeEach(async () => { prisma = await resetDb(); });

describe("generation webhook — failure refund is atomic and exactly-once", () => {
  it("refunds settled credits back to available exactly once, even across a duplicate delivery", async () => {
    const { reserveCredits, settleReservation } = await import("@/lib/wallet");
    const { handleGenerationWebhook } = await import("@/lib/generation-webhook");

    const user = await createUserWithWallet(50);

    const generation = await prisma.generation.create({
      data: {
        userId: user.id,
        tool: "image",
        model: "test-model",
        prompt: "a duplicate-delivery test prompt",
        status: "processing",
        creditsUsed: 20,
        requestId: "req-dup-1",
      },
    });

    // Full reserve → settle cycle for this generation's job: reserve 20,
    // settle at the full 20 (no unused-reservation release).
    await reserveCredits(user.id, 20, generation.id);
    await settleReservation(user.id, generation.id, 20);

    let wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(30);
    expect(wallet.reserved).toBe(0);

    const payload = { request_id: "req-dup-1", status: "failed", error: "provider error" };

    // First delivery: transitions the generation and refunds the settled cost.
    const first = await handleGenerationWebhook(payload);
    expect(first.status).toBe(200);
    expect(first.response).toMatchObject({ success: true, refunded: true });

    wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(50); // back to the opening balance, exactly once
    expect(wallet.reserved).toBe(0);

    // Second (duplicate/retried) delivery for the same job: must not refund again.
    const second = await handleGenerationWebhook(payload);
    expect(second.status).toBe(200);
    expect(second.response).toMatchObject({ success: true, alreadyProcessed: true });

    wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(50); // unchanged by the duplicate

    const refundRows = await prisma.creditLedger.findMany({
      where: { walletId: wallet.id, type: "refund" },
    });
    expect(refundRows).toHaveLength(1);
    expect(refundRows[0].amount).toBe(20);

    const updatedGeneration = await prisma.generation.findUnique({ where: { id: generation.id } });
    expect(updatedGeneration.status).toBe("failed");
    expect(updatedGeneration.error).toBe("provider error");
  });

  it("does not refund a generation that never reserved/spent credits (creditsUsed 0)", async () => {
    const { handleGenerationWebhook } = await import("@/lib/generation-webhook");

    const user = await createUserWithWallet(50);
    const generation = await prisma.generation.create({
      data: {
        userId: user.id,
        tool: "image",
        model: "test-model",
        prompt: "a zero-cost test prompt",
        status: "processing",
        creditsUsed: 0,
        requestId: "req-zero-1",
      },
    });

    const result = await handleGenerationWebhook({ request_id: "req-zero-1", status: "failed", error: "boom" });
    expect(result.status).toBe(200);
    expect(result.response).toMatchObject({ success: true, refunded: false });

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(50);

    const refundRows = await prisma.creditLedger.findMany({ where: { walletId: wallet.id, type: "refund" } });
    expect(refundRows).toHaveLength(0);

    const updatedGeneration = await prisma.generation.findUnique({ where: { id: generation.id } });
    expect(updatedGeneration.status).toBe("failed");
  });
});
