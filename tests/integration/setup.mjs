// SAFETY: integration tests connect to TEST_DATABASE_URL and refuse anything
// that is not a local database. The .env DATABASE_URL points at production —
// it must never be reachable from here.
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL not set — integration tests need a disposable local Postgres (see README).");
}
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1"].includes(host)) {
  throw new Error(`Refusing to run integration tests against non-local host "${host}".`);
}
process.env.DATABASE_URL = url; // src/lib/prisma.js reads this at import time

import { randomUUID } from "node:crypto";

export async function resetDb() {
  const { default: prisma } = await import("@/lib/prisma");
  // Order respects FKs; cascade handles the rest. StripeEvent and
  // AnonRateLimit have no FK to User (both are standalone, key-addressed
  // tables — an idempotency ledger and a hashed-IP rate-limit store,
  // respectively), so they must be truncated explicitly — otherwise rows
  // from a prior test run survive and collide with fixed keys used by
  // idempotency / rate-limit tests.
  await prisma.$executeRawUnsafe(
    `TRUNCATE "public"."User", "public"."StripeEvent", "public"."AnonRateLimit" RESTART IDENTITY CASCADE`
  );
  return prisma;
}

export async function createUserWithWallet(available) {
  const { default: prisma } = await import("@/lib/prisma");
  const user = await prisma.user.create({
    data: { email: `t-${randomUUID()}@test.local`, credits: available },
  });
  await prisma.creditWallet.create({
    data: { userId: user.id, available, reserved: 0, lifetime: available },
  });
  return user;
}
