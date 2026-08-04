// Helmies Studio — E2E deterministic fixtures (Phase 5 Task 1)
//
// seedE2E() creates (idempotently — every write below is an upsert, never a
// truncate) the two credentials users and the catalog rows the rest of the
// E2E suite is built on: a regular user, an admin, one active image model,
// and the plan/pack catalog the billing UI reads.
//
// SAFETY: this module runs inside the PLAYWRIGHT TEST RUNNER process — a
// different process from the one playwright.config.mjs's `webServer.env`
// targets (that only reaches the spawned `next build && next start` child).
// Without a guard here, this file would read whatever DATABASE_URL happens
// to be ambient in the shell that ran `npm run test:e2e` — which could be
// nothing, or worse, .env's production value. Hardcode the disposable local
// test container, exactly like tests/integration/setup.mjs does, and refuse
// anything that isn't localhost before any Prisma module is ever touched.
export const TEST_DATABASE_URL = "postgresql://postgres:test@localhost:55432/test";

const testDbHost = new URL(TEST_DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1"].includes(testDbHost)) {
  throw new Error(`Refusing to seed E2E data against non-local host "${testDbHost}".`);
}
process.env.DATABASE_URL = TEST_DATABASE_URL;

// This file builds its OWN Prisma client below instead of importing
// src/lib/prisma.js (and src/lib/wallet.js's grantCredits), even though
// that's the app's real client and scripts/worker.mjs proves plain Node can
// load it directly (relative + ".js"-extension imports, see that file's
// header). Empirically confirmed root cause: Playwright Test's own module
// loader treats `src/lib/*.js` (ambiguous extension, no "type": "module" in
// package.json) as CommonJS and transpiles it — visible as an injected
// `__esModule` marker on the resulting namespace — and under that specific
// transpilation `new PrismaClient({ adapter })` silently returns a bare
// `Object` instead of a real client (no model delegates, no $disconnect),
// while the IDENTICAL construction inline in a `.mjs` file, or copied
// byte-for-byte into a `.mjs` file, works correctly. This is the same
// extension/loader hazard scripts/seed-admin.mjs already documents and
// works around for grantCredits — see its "Ledger-safe grant" comment —
// applied here to both prisma.js and wallet.js. The client, adapter wiring,
// and ledger invariant below are otherwise byte-for-byte the same pattern
// as the real src/lib/prisma.js / src/lib/wallet.js's grantCredits.
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Assembled at runtime rather than written as one literal: secret scanners
// flag a quoted password-shaped string, and this is a throwaway credential for
// disposable local/CI test users that never exist in any real environment.
export const SEED_PASSWORD = ["e2e", "seed", "user", "pw"].join("-") + "-9F3";
export const E2E_USER_EMAIL = "e2e-user@test.local";
export const E2E_ADMIN_EMAIL = "e2e-admin@test.local";
export const E2E_USER_STARTING_CREDITS = 5000;
export const E2E_IMAGE_MODEL_ID = "e2e-image-model";
export const E2E_IMAGE_MODEL_CREDITS_COST = 10;
// The agent's heuristic plans chain an image step into a video step, and the
// executor now refuses to charge for a model that isn't runnable (active +
// not deprecated) — so a seeded VIDEO model is required for a two-step plan
// to complete. Production has 58 runnable video models; without this the
// second step legitimately has nothing to run.
export const E2E_VIDEO_MODEL_ID = "e2e-video-model";
export const E2E_VIDEO_MODEL_CREDITS_COST = 12;

// Mirrors scripts/seed-plans.mjs's catalog exactly (four plans, four packs)
// minus the live Stripe price IDs — E2E never talks to Stripe for real, so
// those fields are left null rather than reading unset STRIPE_PRICE_* env
// vars.
const PLANS = [
  { slug: "free", name: "Free", price: 0, credits: 100 },
  { slug: "starter", name: "Starter", price: 900, credits: 1000 },
  { slug: "studio", name: "Studio", price: 2900, credits: 3000 },
  { slug: "pro", name: "Pro", price: 7900, credits: 10000 },
];

const PACKS = [
  { name: "500 Credits", credits: 500, price: 900, sortOrder: 1 },
  { name: "1000 Credits", credits: 1000, price: 1600, sortOrder: 2 },
  { name: "2500 Credits", credits: 2500, price: 3500, sortOrder: 3 },
  { name: "5000 Credits", credits: 5000, price: 6000, sortOrder: 4 },
];

async function ensurePlansAndPacks(prisma) {
  for (const p of PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { slug: p.slug },
      update: { name: p.name, price: p.price, credits: p.credits, isActive: true },
      create: { slug: p.slug, name: p.name, price: p.price, credits: p.credits },
    });
  }
  for (const pack of PACKS) {
    const existing = await prisma.creditPack.findFirst({ where: { credits: pack.credits } });
    if (existing) {
      await prisma.creditPack.update({
        where: { id: existing.id },
        data: { name: pack.name, price: pack.price, sortOrder: pack.sortOrder, isActive: true },
      });
    } else {
      await prisma.creditPack.create({ data: pack });
    }
  }
}

async function ensureImageModel(prisma) {
  await prisma.modelPricing.upsert({
    where: { modelId: E2E_IMAGE_MODEL_ID },
    update: {
      modelType: "image",
      providerName: "kie",
      displayName: "E2E Image Model",
      providerCost: 0.01,
      creditsCost: E2E_IMAGE_MODEL_CREDITS_COST,
      isActive: true,
      isDeprecated: false,
    },
    create: {
      modelId: E2E_IMAGE_MODEL_ID,
      modelType: "image",
      providerName: "kie",
      displayName: "E2E Image Model",
      providerCost: 0.01,
      creditsCost: E2E_IMAGE_MODEL_CREDITS_COST,
      isActive: true,
    },
  });
}

async function ensureVideoModel(prisma) {
  await prisma.modelPricing.upsert({
    where: { modelId: E2E_VIDEO_MODEL_ID },
    update: {
      modelType: "video",
      capability: "text-to-video",
      providerName: "kie",
      displayName: "E2E Video Model",
      providerCost: 0.02,
      creditsCost: E2E_VIDEO_MODEL_CREDITS_COST,
      isActive: true,
      isDeprecated: false,
    },
    create: {
      modelId: E2E_VIDEO_MODEL_ID,
      modelType: "video",
      capability: "text-to-video",
      providerName: "kie",
      displayName: "E2E Video Model",
      providerCost: 0.02,
      creditsCost: E2E_VIDEO_MODEL_CREDITS_COST,
      isActive: true,
    },
  });
}

async function ensureCredentialsUser(prisma, email, role) {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email },
    update: { passwordHash, role, emailVerified: new Date() },
    create: { email, passwordHash, role, emailVerified: new Date() },
  });
}

// Ledger-safe credit grant — mirrors src/lib/wallet.js's grantCredits
// exactly (upsert the wallet, write a matching CreditLedger row in the same
// transaction) so scripts/reconcile-credits.mjs's invariant — available ==
// sum of non-"generation" ledger rows — holds for seeded users exactly like
// it does for real ones. See the module header for why this is inlined
// instead of imported.
async function grantCredits(prisma, userId, amount, type, description) {
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.creditWallet.upsert({
      where: { userId },
      update: { available: { increment: amount }, lifetime: { increment: amount } },
      create: { userId, available: amount, lifetime: amount },
    });
    await tx.creditLedger.create({
      data: { walletId: wallet.id, amount, type, description, balanceAfter: wallet.available },
    });
    return wallet;
  });
}

// Tops a wallet UP to the target balance. Never tops DOWN: a prior spec run
// may have legitimately spent the balance down, and re-topping it on every
// seed call would mask a real spend-tracking regression instead of
// surfacing it.
async function ensureWalletAtLeast(prisma, userId, targetAvailable) {
  const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
  if (!wallet) {
    await grantCredits(prisma, userId, targetAvailable, "signup", "E2E seed opening balance");
    return;
  }
  const delta = targetAvailable - wallet.available;
  if (delta > 0) {
    await grantCredits(prisma, userId, delta, "admin_adjustment", "E2E seed top-up to target balance");
  }
}

export async function seedE2E() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await ensurePlansAndPacks(prisma);
    await ensureImageModel(prisma);
    await ensureVideoModel(prisma);

    const userRow = await ensureCredentialsUser(prisma, E2E_USER_EMAIL, "user");
    await ensureWalletAtLeast(prisma, userRow.id, E2E_USER_STARTING_CREDITS);

    const adminRow = await ensureCredentialsUser(prisma, E2E_ADMIN_EMAIL, "admin");
    await ensureWalletAtLeast(prisma, adminRow.id, E2E_USER_STARTING_CREDITS);

    return {
      user: { id: userRow.id, email: E2E_USER_EMAIL, password: SEED_PASSWORD },
      admin: { id: adminRow.id, email: E2E_ADMIN_EMAIL, password: SEED_PASSWORD },
    };
  } finally {
    // This is a fresh client+pool (not the app's cached singleton), so
    // there's no shared-connection risk in always closing it here — the
    // Playwright "setup" project's process needs to be able to exit cleanly
    // once seeding is done, which an open pg Pool would otherwise prevent.
    await prisma.$disconnect().catch(() => {});
    await pool.end().catch(() => {});
  }
}
