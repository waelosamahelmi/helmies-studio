#!/usr/bin/env node
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// A real Stripe price id looks like "price_1Nxxx...". Anything else — unset,
// blank, or a placeholder like "price_..." (which is what an unset env var
// substituted into a template literally became on the server, and is why
// production ended up with rows that pass a truthy check but 500 the moment
// Stripe is actually called) — must never be written to the DB. Kept in
// sync with the equivalent guard in src/app/api/stripe/checkout/route.js.
export const PLACEHOLDER_PRICE_ID = /^price_\.*$/;
export const REAL_PRICE_ID = /^price_.+$/;

// Resolve one STRIPE_PRICE_* env var to either a real price id, or null +
// a human-readable reason it was rejected. Exported (pure, no I/O) so it
// can be unit tested without touching the database.
export function resolvePriceId(envVarName) {
  if (!envVarName) return { value: null, reason: null };
  const raw = process.env[envVarName];
  if (raw == null) return { value: null, reason: "not set" };
  const trimmed = String(raw).trim();
  if (trimmed === "") return { value: null, reason: "empty" };
  if (PLACEHOLDER_PRICE_ID.test(trimmed)) return { value: null, reason: `placeholder value "${trimmed}"` };
  if (!REAL_PRICE_ID.test(trimmed)) return { value: null, reason: `does not look like a Stripe price id: "${trimmed}"` };
  return { value: trimmed, reason: null };
}

export const PLANS = [
  { slug: "free",    name: "Free",    price: 0,     credits: 100,   monthlyEnv: null,                    yearlyEnv: null },
  { slug: "starter", name: "Starter", price: 900,   credits: 1000,  monthlyEnv: "STRIPE_PRICE_STARTER", yearlyEnv: "STRIPE_PRICE_STARTER_YEARLY" },
  { slug: "studio",  name: "Studio",  price: 2900,  credits: 3000,  monthlyEnv: "STRIPE_PRICE_STUDIO",  yearlyEnv: "STRIPE_PRICE_STUDIO_YEARLY" },
  { slug: "pro",     name: "Pro",     price: 7900,  credits: 10000, monthlyEnv: "STRIPE_PRICE_PRO",     yearlyEnv: "STRIPE_PRICE_PRO_YEARLY" },
];
// NOTE: verify the `price` euro-cent amounts against the live /pricing page
// before seeding production; they are display metadata — the charge amount
// always comes from the Stripe price object.

export const PACKS = [
  { name: "500 Credits",  credits: 500,  price: 900,  sortOrder: 1 },
  { name: "1000 Credits", credits: 1000, price: 1600, sortOrder: 2 },
  { name: "2500 Credits", credits: 2500, price: 3500, sortOrder: 3 },
  { name: "5000 Credits", credits: 5000, price: 6000, sortOrder: 4 },
];

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const warnings = [];

  for (const p of PLANS) {
    const monthly = resolvePriceId(p.monthlyEnv);
    const yearly = resolvePriceId(p.yearlyEnv);
    if (p.monthlyEnv && !monthly.value) warnings.push(`${p.slug} monthly (${p.monthlyEnv}): ${monthly.reason}`);
    if (p.yearlyEnv && !yearly.value) warnings.push(`${p.slug} yearly (${p.yearlyEnv}): ${yearly.reason}`);

    await prisma.subscriptionPlan.upsert({
      where: { slug: p.slug },
      update: { credits: p.credits, stripePriceId: monthly.value, stripePriceIdYearly: yearly.value, isActive: true },
      create: { slug: p.slug, name: p.name, price: p.price, credits: p.credits, stripePriceId: monthly.value, stripePriceIdYearly: yearly.value },
    });
  }
  for (const pack of PACKS) {
    const existing = await prisma.creditPack.findFirst({ where: { credits: pack.credits } });
    if (existing) await prisma.creditPack.update({ where: { id: existing.id }, data: { name: pack.name, price: pack.price, sortOrder: pack.sortOrder, isActive: true } });
    else await prisma.creditPack.create({ data: pack });
  }
  console.log("Seeded", PLANS.length, "plans and", PACKS.length, "packs.");
  if (warnings.length) {
    console.warn("\nWARNING: the following plans have no usable Stripe price id — stripePriceId/stripePriceIdYearly written as null. Checkout for these plans/periods will return 503 until a real STRIPE_PRICE_* value is set and this script is re-run:");
    for (const w of warnings) console.warn(`  - ${w}`);
  }
  await prisma.$disconnect();
}

// Only run the DB-touching seed when this file is executed directly
// (`node scripts/seed-plans.mjs`), not when imported by a test for its
// pure `resolvePriceId` export.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main();
}
