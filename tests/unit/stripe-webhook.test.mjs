import { describe, it, expect, vi, beforeEach } from "vitest";

// The route claims the StripeEvent row and runs every grant/handler write
// inside ONE prisma.$transaction, so a crash between "grant credits" and
// "record the event as processed" rolls back both instead of leaving a
// window where Stripe's retry re-grants credits. Modeled with a distinct
// `txClient` object (separate from the top-level `prisma`) so assertions can
// prove a write went through the transaction, not around it.
vi.mock("@/lib/prisma", () => {
  const txClient = {
    stripeEvent: { create: vi.fn() },
    templatePurchase: { upsert: vi.fn() },
    subscription: { updateMany: vi.fn() },
  };
  const prisma = {
    stripeEvent: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn) => fn(txClient)),
    __txClient: txClient,
  };
  return { default: prisma };
});

vi.mock("@/lib/wallet", () => ({ grantCredits: vi.fn() }));

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

import prisma from "@/lib/prisma";
import { grantCredits } from "@/lib/wallet";
import * as stripeModule from "stripe";
import { POST } from "@/app/api/stripe/webhook/route.js";

const { __instance: stripeInstance } = stripeModule;
const txClient = prisma.__txClient;

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy";

function webhookRequest(body = "{}") {
  return new Request("http://test/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig_dummy" },
    body,
  });
}

const topupEvent = {
  id: "evt_topup_1",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_1",
      amount_total: 1000,
      metadata: { userId: "u1", type: "credit_topup", credits: "500" },
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.stripeEvent.findUnique.mockResolvedValue(null);
  stripeInstance.webhooks.constructEvent.mockReturnValue(topupEvent);
});

describe("POST /api/stripe/webhook — checkout.session.completed top-up", () => {
  it("claims the event and grants credits inside the SAME transaction, then returns 200", async () => {
    grantCredits.mockResolvedValue({});

    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txClient.stripeEvent.create).toHaveBeenCalledWith({
      data: { stripeEventId: "evt_topup_1", eventType: "checkout.session.completed" },
    });
    expect(grantCredits).toHaveBeenCalledWith(
      "u1", 500, "topup", "Credit top-up: 500 credits", "cs_1", txClient
    );
  });
});

describe("POST /api/stripe/webhook — handler failure rolls back with the claim", () => {
  it("returns 500 and never writes a second, un-transacted stripeEvent.create", async () => {
    grantCredits.mockRejectedValueOnce(new Error("grant boom"));

    const res = await POST(webhookRequest());
    expect(res.status).toBe(500);

    // The only create call is the one inside the (mock-rolled-back) tx —
    // proving there's no separate top-level `prisma.stripeEvent.create`
    // call site left over from the old post-handler write.
    expect(txClient.stripeEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.stripeEvent.create).toBeUndefined();
  });
});

describe("POST /api/stripe/webhook — concurrent duplicate via unique constraint", () => {
  it("returns 200 received:true when $transaction rejects with P2002 on stripeEventId", async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: "P2002", meta: { target: ["stripeEventId"] } });

    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
  });
});

describe("POST /api/stripe/webhook — pre-check duplicate short-circuits", () => {
  it("returns 200 without ever opening a transaction when findUnique finds the event already processed", async () => {
    prisma.stripeEvent.findUnique.mockResolvedValue({ id: "x1", stripeEventId: "evt_topup_1" });

    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — checkout.session.completed template_purchase", () => {
  it("upserts the template purchase through the tx client", async () => {
    stripeInstance.webhooks.constructEvent.mockReturnValue({
      id: "evt_tpl_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_2",
          amount_total: 2500,
          metadata: { userId: "u2", type: "template_purchase", templateId: "tpl_1" },
        },
      },
    });

    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);
    expect(txClient.templatePurchase.upsert).toHaveBeenCalledWith({
      where: { userId_templateId: { userId: "u2", templateId: "tpl_1" } },
      update: {},
      create: {
        userId: "u2",
        templateId: "tpl_1",
        purchaseType: "onetime",
        usageRemaining: 1,
        stripeSessionId: "cs_2",
        stripePricePaid: 2500,
      },
    });
    expect(grantCredits).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — checkout.session.completed subscription plan", () => {
  it("grants subscription_grant credits through the tx", async () => {
    stripeInstance.webhooks.constructEvent.mockReturnValue({
      id: "evt_sub_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_3",
          metadata: { userId: "u3", plan: "starter" },
        },
      },
    });
    grantCredits.mockResolvedValue({});

    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);
    expect(grantCredits).toHaveBeenCalledWith(
      "u3", 1000, "subscription_grant", "starter plan subscription: 1000 credits", "cs_3", txClient
    );
  });
});

describe("POST /api/stripe/webhook — invoice.paid", () => {
  it("prefetches the subscription BEFORE opening the transaction, then grants + updates inside the tx using the prefetched data", async () => {
    const callOrder = [];
    stripeInstance.subscriptions.retrieve.mockImplementationOnce(async (id) => {
      callOrder.push(`retrieve:${id}`);
      return {
        metadata: { userId: "u4", plan: "studio" },
        items: { data: [{ price: { id: "price_studio" } }] },
        current_period_end: 1700000000,
      };
    });
    prisma.$transaction.mockImplementationOnce(async (fn) => {
      callOrder.push("transaction-start");
      return fn(txClient);
    });
    stripeInstance.webhooks.constructEvent.mockReturnValue({
      id: "evt_inv_1",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_1",
          subscription: "sub_1",
          billing_reason: "subscription_cycle",
        },
      },
    });
    grantCredits.mockResolvedValue({});

    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);

    expect(callOrder).toEqual(["retrieve:sub_1", "transaction-start"]);
    expect(stripeInstance.subscriptions.retrieve).toHaveBeenCalledTimes(1);

    expect(grantCredits).toHaveBeenCalledWith(
      "u4", 3000, "subscription_grant", "studio plan renewal: 3000 credits", "in_1", txClient
    );
    expect(txClient.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: "u4" },
      data: {
        stripeSubscriptionId: "sub_1",
        stripePriceId: "price_studio",
        stripeCurrentPeriodEnd: new Date(1700000000 * 1000),
        plan: "studio",
        status: "active",
      },
    });
  });
});

describe("POST /api/stripe/webhook — customer.subscription.deleted", () => {
  it("cancels the subscription through the tx client", async () => {
    stripeInstance.webhooks.constructEvent.mockReturnValue({
      id: "evt_del_1",
      type: "customer.subscription.deleted",
      data: { object: { metadata: { userId: "u5" } } },
    });

    const res = await POST(webhookRequest());
    expect(res.status).toBe(200);
    expect(txClient.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: "u5" },
      data: { status: "cancelled", plan: "free" },
    });
  });
});
