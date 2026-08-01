#!/usr/bin/env node
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const PLANS = [
  { slug: "free",    name: "Free",    price: 0,     credits: 100,   monthly: null,                             yearly: null },
  { slug: "starter", name: "Starter", price: 900,   credits: 1000,  monthly: process.env.STRIPE_PRICE_STARTER, yearly: process.env.STRIPE_PRICE_STARTER_YEARLY },
  { slug: "studio",  name: "Studio",  price: 2900,  credits: 3000,  monthly: process.env.STRIPE_PRICE_STUDIO,  yearly: process.env.STRIPE_PRICE_STUDIO_YEARLY },
  { slug: "pro",     name: "Pro",     price: 7900,  credits: 10000, monthly: process.env.STRIPE_PRICE_PRO,     yearly: process.env.STRIPE_PRICE_PRO_YEARLY },
];
// NOTE: verify the `price` euro-cent amounts against the live /pricing page
// before seeding production; they are display metadata — the charge amount
// always comes from the Stripe price object.

const PACKS = [
  { name: "500 Credits",  credits: 500,  price: 900,  sortOrder: 1 },
  { name: "1000 Credits", credits: 1000, price: 1600, sortOrder: 2 },
  { name: "2500 Credits", credits: 2500, price: 3500, sortOrder: 3 },
  { name: "5000 Credits", credits: 5000, price: 6000, sortOrder: 4 },
];

for (const p of PLANS) {
  await prisma.subscriptionPlan.upsert({
    where: { slug: p.slug },
    update: { credits: p.credits, stripePriceId: p.monthly, stripePriceIdYearly: p.yearly, isActive: true },
    create: { slug: p.slug, name: p.name, price: p.price, credits: p.credits, stripePriceId: p.monthly, stripePriceIdYearly: p.yearly },
  });
}
for (const pack of PACKS) {
  const existing = await prisma.creditPack.findFirst({ where: { credits: pack.credits } });
  if (existing) await prisma.creditPack.update({ where: { id: existing.id }, data: { name: pack.name, price: pack.price, sortOrder: pack.sortOrder, isActive: true } });
  else await prisma.creditPack.create({ data: pack });
}
console.log("Seeded", PLANS.length, "plans and", PACKS.length, "packs.");
await prisma.$disconnect();
