import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb, createUserWithWallet } from "./setup.mjs";

// Real DB, module-mocked stripe: no network call, no real signature check —
// constructEvent just hands back whatever fixture event the test sets. This
// proves the actual Postgres transaction semantics (claim + grant commit or
// roll back together), which a fully-mocked unit test cannot.
vi.mock("stripe", () => {
  const constructEvent = vi.fn();
  const retrieve = vi.fn();
  const instance = {
    webhooks: { constructEvent },
    subscriptions: { retrieve },
  };
  const StripeCtor = vi.fn(function StripeMock() {
    return instance;
  });
  return { default: StripeCtor, __instance: instance };
});

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy";

import * as stripeModule from "stripe";
const stripeInstance = stripeModule.__instance;

function webhookRequest() {
  return new Request("http://test/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig_dummy" },
    body: "{}",
  });
}

let prisma;
beforeEach(async () => {
  prisma = await resetDb();
  stripeInstance.webhooks.constructEvent.mockReset();
});

describe("stripe webhook — claim + grant are atomic (real Postgres transaction)", () => {
  it("(a) first delivery grants credits and writes both the CreditLedger row and the StripeEvent row", async () => {
    const { POST } = await import("@/app/api/stripe/webhook/route.js");
    const user = await createUserWithWallet(0);

    stripeInstance.webhooks.constructEvent.mockReturnValue({
      id: "evt_int_topup_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_int_1",
          metadata: { userId: user.id, type: "credit_topup", credits: "500" },
        },
      },
    });

    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(500);

    const ledgerRows = await prisma.creditLedger.findMany({ where: { walletId: wallet.id, type: "topup" } });
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0].amount).toBe(500);

    const eventRows = await prisma.stripeEvent.findMany({ where: { stripeEventId: "evt_int_topup_1" } });
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0].eventType).toBe("checkout.session.completed");
  });

  it("(b) a duplicate delivery of the same event does not write a second ledger row or grant credits again", async () => {
    const { POST } = await import("@/app/api/stripe/webhook/route.js");
    const user = await createUserWithWallet(0);

    stripeInstance.webhooks.constructEvent.mockReturnValue({
      id: "evt_int_topup_2",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_int_2",
          metadata: { userId: user.id, type: "credit_topup", credits: "500" },
        },
      },
    });

    const first = await POST(webhookRequest());
    expect(first.status).toBe(200);

    const second = await POST(webhookRequest());
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ received: true });

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(500); // unchanged by the duplicate

    const ledgerRows = await prisma.creditLedger.findMany({ where: { walletId: wallet.id, type: "topup" } });
    expect(ledgerRows).toHaveLength(1); // still exactly one grant

    const eventRows = await prisma.stripeEvent.findMany({ where: { stripeEventId: "evt_int_topup_2" } });
    expect(eventRows).toHaveLength(1); // claim row not duplicated either
  });

  it("(c) a forced handler failure leaves NO StripeEvent row, so a retry can succeed", async () => {
    const { POST } = await import("@/app/api/stripe/webhook/route.js");

    // Grant to a userId with no matching User row: CreditWallet.userId has a
    // real FK to User(id), so grantCredits's upsert genuinely violates the
    // constraint inside the transaction — a real Postgres failure, not a
    // mocked throw. If the claim and the grant are in the same transaction,
    // the whole thing rolls back and the StripeEvent row never lands.
    stripeInstance.webhooks.constructEvent.mockReturnValue({
      id: "evt_int_fail_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_int_fail_1",
          metadata: { userId: "does-not-exist", type: "credit_topup", credits: "500" },
        },
      },
    });

    const res = await POST(webhookRequest());
    expect(res.status).toBe(500);

    const eventRows = await prisma.stripeEvent.findMany({ where: { stripeEventId: "evt_int_fail_1" } });
    expect(eventRows).toHaveLength(0); // claim did NOT survive the rolled-back tx

    // Prove the retry path: same event, now with a real user, succeeds and
    // grants exactly once — nothing about the failed attempt half-landed.
    const user = await createUserWithWallet(0);
    stripeInstance.webhooks.constructEvent.mockReturnValue({
      id: "evt_int_fail_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_int_fail_1",
          metadata: { userId: user.id, type: "credit_topup", credits: "500" },
        },
      },
    });

    const retry = await POST(webhookRequest());
    expect(retry.status).toBe(200);

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(500);

    const retryEventRows = await prisma.stripeEvent.findMany({ where: { stripeEventId: "evt_int_fail_1" } });
    expect(retryEventRows).toHaveLength(1);
  });
});
