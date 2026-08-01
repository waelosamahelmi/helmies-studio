import { describe, it, expect, vi, beforeEach } from "vitest";

// Task 10: checkout, top-up and the webhook must all resolve prices/credits
// from the SubscriptionPlan/CreditPack tables the admin editors write —
// not from env-var price maps, plan-constants.js, or credit-packs.js. Those
// files stay for DISPLAY copy only; billing decisions must go through Prisma.

vi.mock("@/lib/session", () => ({
  getCurrentUserWithCredits: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const txClient = {
    stripeEvent: { create: vi.fn() },
    templatePurchase: { upsert: vi.fn() },
    subscription: { updateMany: vi.fn() },
    subscriptionPlan: { findUnique: vi.fn(), findFirst: vi.fn() },
  };
  const prisma = {
    subscriptionPlan: { findUnique: vi.fn() },
    creditPack: { findMany: vi.fn(), findUnique: vi.fn() },
    subscription: { findFirst: vi.fn(), upsert: vi.fn(), create: vi.fn() },
    stripeEvent: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn) => fn(txClient)),
    __txClient: txClient,
  };
  return { default: prisma };
});

vi.mock("@/lib/wallet", () => ({ grantCredits: vi.fn() }));

vi.mock("stripe", () => {
  const customersCreate = vi.fn();
  const sessionsCreate = vi.fn();
  const constructEvent = vi.fn();
  const retrieve = vi.fn();
  const instance = {
    customers: { create: customersCreate },
    checkout: { sessions: { create: sessionsCreate } },
    webhooks: { constructEvent },
    subscriptions: { retrieve },
  };
  const StripeCtor = vi.fn(function StripeMock() {
    return instance;
  });
  return { default: StripeCtor, __instance: instance };
});

import prisma from "@/lib/prisma";
import { getCurrentUserWithCredits } from "@/lib/session";
import { grantCredits } from "@/lib/wallet";
import * as stripeModule from "stripe";

const { __instance: stripeInstance } = stripeModule;
const txClient = prisma.__txClient;

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserWithCredits.mockResolvedValue({ id: "u1", email: "u1@test.local", credits: 0 });
  prisma.subscription.findFirst.mockResolvedValue(null);
  prisma.subscription.upsert.mockResolvedValue({});
  prisma.subscription.create.mockResolvedValue({});
  stripeInstance.customers.create.mockResolvedValue({ id: "cus_1" });
  stripeInstance.checkout.sessions.create.mockResolvedValue({ url: "https://stripe.test/session" });
  prisma.stripeEvent.findUnique.mockResolvedValue(null);
});

function jsonRequest(url, body) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Checkout ─────────────────────────────────────────────────────────────

describe("POST /api/stripe/checkout — plan resolved from SubscriptionPlan", () => {
  it("monthly: looks up the plan by slug and uses the row's stripePriceId", async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue({
      slug: "studio",
      isActive: true,
      stripePriceId: "price_studio_monthly",
      stripePriceIdYearly: "price_studio_yearly",
    });

    const { POST } = await import("@/app/api/stripe/checkout/route.js");
    const res = await POST(jsonRequest("http://test/api/stripe/checkout", { plan: "studio", yearly: false }));

    expect(res.status).toBe(200);
    expect(prisma.subscriptionPlan.findUnique).toHaveBeenCalledWith({ where: { slug: "studio" } });
    expect(stripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: "price_studio_monthly", quantity: 1 }],
      })
    );
  });

  it("yearly: uses the row's stripePriceIdYearly, not the monthly id", async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue({
      slug: "studio",
      isActive: true,
      stripePriceId: "price_studio_monthly",
      stripePriceIdYearly: "price_studio_yearly",
    });

    const { POST } = await import("@/app/api/stripe/checkout/route.js");
    const res = await POST(jsonRequest("http://test/api/stripe/checkout", { plan: "studio", yearly: true }));

    expect(res.status).toBe(200);
    expect(stripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: "price_studio_yearly", quantity: 1 }],
      })
    );
  });

  it("missing plan row → 400 'Plan not configured', no Stripe session created", async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue(null);

    const { POST } = await import("@/app/api/stripe/checkout/route.js");
    const res = await POST(jsonRequest("http://test/api/stripe/checkout", { plan: "ghost", yearly: false }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Plan not configured" });
    expect(stripeInstance.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("inactive plan row → 400 'Plan not configured', no Stripe session created", async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue({
      slug: "studio",
      isActive: false,
      stripePriceId: "price_studio_monthly",
      stripePriceIdYearly: "price_studio_yearly",
    });

    const { POST } = await import("@/app/api/stripe/checkout/route.js");
    const res = await POST(jsonRequest("http://test/api/stripe/checkout", { plan: "studio", yearly: false }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Plan not configured" });
    expect(stripeInstance.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("active row but the requested billing period has no price id → 400, no Stripe session", async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue({
      slug: "starter",
      isActive: true,
      stripePriceId: "price_starter_monthly",
      stripePriceIdYearly: null,
    });

    const { POST } = await import("@/app/api/stripe/checkout/route.js");
    const res = await POST(jsonRequest("http://test/api/stripe/checkout", { plan: "starter", yearly: true }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Plan not configured" });
    expect(stripeInstance.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

// ── Top-up ───────────────────────────────────────────────────────────────

describe("GET /api/stripe/topup — packs read from CreditPack", () => {
  it("lists only active packs, ordered by sortOrder", async () => {
    prisma.creditPack.findMany.mockResolvedValue([
      { id: "pk_1", name: "500 Credits", credits: 500, price: 900, isActive: true, sortOrder: 1 },
      { id: "pk_2", name: "1000 Credits", credits: 1000, price: 1600, isActive: true, sortOrder: 2 },
    ]);

    const { GET } = await import("@/app/api/stripe/topup/route.js");
    const res = await GET();

    expect(prisma.creditPack.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    const body = await res.json();
    expect(body.packs).toHaveLength(2);
    expect(body.packs[0]).toMatchObject({ id: "pk_1", credits: 500, priceEur: 9 });
  });
});

describe("POST /api/stripe/topup — pack resolved from CreditPack", () => {
  it("resolves the pack by id, unit_amount is the row's price in cents, metadata credits is the row's credits", async () => {
    prisma.creditPack.findUnique.mockResolvedValue({
      id: "pk_1",
      name: "500 Credits",
      credits: 500,
      price: 900,
      isActive: true,
    });

    const { POST } = await import("@/app/api/stripe/topup/route.js");
    const res = await POST(jsonRequest("http://test/api/stripe/topup", { packId: "pk_1" }));

    expect(res.status).toBe(200);
    expect(prisma.creditPack.findUnique).toHaveBeenCalledWith({ where: { id: "pk_1" } });
    expect(stripeInstance.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: 900 }),
          }),
        ],
        metadata: expect.objectContaining({ credits: 500, type: "credit_topup" }),
      })
    );
  });

  it("missing pack row → 400 'Invalid pack', no Stripe session created", async () => {
    prisma.creditPack.findUnique.mockResolvedValue(null);

    const { POST } = await import("@/app/api/stripe/topup/route.js");
    const res = await POST(jsonRequest("http://test/api/stripe/topup", { packId: "ghost" }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid pack" });
    expect(stripeInstance.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("inactive pack row → 400 'Invalid pack', no Stripe session created", async () => {
    prisma.creditPack.findUnique.mockResolvedValue({
      id: "pk_1", name: "500 Credits", credits: 500, price: 900, isActive: false,
    });

    const { POST } = await import("@/app/api/stripe/topup/route.js");
    const res = await POST(jsonRequest("http://test/api/stripe/topup", { packId: "pk_1" }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid pack" });
    expect(stripeInstance.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

// ── Webhook grants ───────────────────────────────────────────────────────

describe("POST /api/stripe/webhook — subscription grant amount comes from SubscriptionPlan", () => {
  function webhookRequest() {
    return new Request("http://test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig_dummy" },
      body: "{}",
    });
  }

  it("checkout.session.completed: grants credits from the plan row matched by slug", async () => {
    stripeInstance.webhooks.constructEvent.mockReturnValue({
      id: "evt_plan_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          metadata: { userId: "u9", plan: "pro" },
        },
      },
    });
    txClient.subscriptionPlan.findUnique.mockResolvedValue({ slug: "pro", credits: 10000 });
    grantCredits.mockResolvedValue({});

    const { POST } = await import("@/app/api/stripe/webhook/route.js");
    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(txClient.subscriptionPlan.findUnique).toHaveBeenCalledWith({ where: { slug: "pro" } });
    expect(grantCredits).toHaveBeenCalledWith(
      "u9", 10000, "subscription_grant", "pro plan subscription: 10000 credits", "cs_1", txClient
    );
  });

  it("checkout.session.completed: missing plan row grants nothing but still claims the event (200)", async () => {
    stripeInstance.webhooks.constructEvent.mockReturnValue({
      id: "evt_plan_missing",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_missing",
          metadata: { userId: "u10", plan: "mystery" },
        },
      },
    });
    txClient.subscriptionPlan.findUnique.mockResolvedValue(null);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("@/app/api/stripe/webhook/route.js");
    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(grantCredits).not.toHaveBeenCalled();
    expect(txClient.stripeEvent.create).toHaveBeenCalledWith({
      data: { stripeEventId: "evt_plan_missing", eventType: "checkout.session.completed" },
    });
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("mystery"));
    errSpy.mockRestore();
  });

  it("invoice.paid: resolves the plan row by matching the invoice's MONTHLY price id", async () => {
    stripeInstance.subscriptions.retrieve.mockResolvedValue({
      metadata: { userId: "u-inv-monthly" },
      items: { data: [{ price: { id: "price_studio_monthly" } }] },
      current_period_end: 1700000000,
    });
    stripeInstance.webhooks.constructEvent.mockReturnValue({
      id: "evt_inv_monthly",
      type: "invoice.paid",
      data: { object: { id: "in_1", subscription: "sub_1", billing_reason: "subscription_cycle" } },
    });
    txClient.subscriptionPlan.findFirst.mockResolvedValue({ slug: "studio", credits: 3000 });
    grantCredits.mockResolvedValue({});

    const { POST } = await import("@/app/api/stripe/webhook/route.js");
    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(txClient.subscriptionPlan.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ stripePriceId: "price_studio_monthly" }, { stripePriceIdYearly: "price_studio_monthly" }] },
    });
    expect(grantCredits).toHaveBeenCalledWith(
      "u-inv-monthly", 3000, "subscription_grant", "studio plan renewal: 3000 credits", "in_1", txClient
    );
  });

  it("invoice.paid: resolves the plan row by matching the invoice's YEARLY price id", async () => {
    stripeInstance.subscriptions.retrieve.mockResolvedValue({
      metadata: { userId: "u11" },
      items: { data: [{ price: { id: "price_studio_yearly" } }] },
      current_period_end: 1700000000,
    });
    stripeInstance.webhooks.constructEvent.mockReturnValue({
      id: "evt_inv_yearly",
      type: "invoice.paid",
      data: { object: { id: "in_2", subscription: "sub_2", billing_reason: "subscription_cycle" } },
    });
    txClient.subscriptionPlan.findFirst.mockResolvedValue({ slug: "studio", credits: 3000 });
    grantCredits.mockResolvedValue({});

    const { POST } = await import("@/app/api/stripe/webhook/route.js");
    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(txClient.subscriptionPlan.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ stripePriceId: "price_studio_yearly" }, { stripePriceIdYearly: "price_studio_yearly" }] },
    });
    expect(grantCredits).toHaveBeenCalledWith(
      "u11", 3000, "subscription_grant", "studio plan renewal: 3000 credits", "in_2", txClient
    );
  });

  it("invoice.paid: prefers the slug on subscription metadata over a price-id lookup", async () => {
    stripeInstance.subscriptions.retrieve.mockResolvedValue({
      metadata: { userId: "u12", plan: "pro" },
      items: { data: [{ price: { id: "price_studio_monthly" } }] },
      current_period_end: 1700000000,
    });
    stripeInstance.webhooks.constructEvent.mockReturnValue({
      id: "evt_inv_slug",
      type: "invoice.paid",
      data: { object: { id: "in_3", subscription: "sub_3", billing_reason: "subscription_cycle" } },
    });
    txClient.subscriptionPlan.findUnique.mockResolvedValue({ slug: "pro", credits: 10000 });
    grantCredits.mockResolvedValue({});

    const { POST } = await import("@/app/api/stripe/webhook/route.js");
    const res = await POST(webhookRequest());

    expect(res.status).toBe(200);
    expect(txClient.subscriptionPlan.findUnique).toHaveBeenCalledWith({ where: { slug: "pro" } });
    expect(txClient.subscriptionPlan.findFirst).not.toHaveBeenCalled();
    expect(grantCredits).toHaveBeenCalledWith(
      "u12", 10000, "subscription_grant", "pro plan renewal: 10000 credits", "in_3", txClient
    );
  });
});
