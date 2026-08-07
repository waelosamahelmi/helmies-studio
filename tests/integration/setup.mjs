// SAFETY: integration tests connect to TEST_DATABASE_URL and refuse anything
// that is not a local database. The .env DATABASE_URL points at production —
// it must never be reachable from here.
// Read TEST_DATABASE_URL out of .env when it is not already exported. This
// deliberately does NOT use dotenv: a full load would also pull the
// production DATABASE_URL into this process, and the whole point of this
// file is that production is unreachable from here. Only the one key is
// ever taken, and it still has to pass the local-host check below.
if (!process.env.TEST_DATABASE_URL) {
  const { readFileSync } = await import("node:fs");
  try {
    const line = readFileSync(new URL("../../.env", import.meta.url), "utf8")
      .split(/\r?\n/)
      .find((l) => /^\s*TEST_DATABASE_URL\s*=/.test(l));
    if (line) {
      process.env.TEST_DATABASE_URL = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env — the explicit-env path below still applies */ }
}

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
  // Order respects FKs; cascade handles the rest. StripeEvent,
  // AnonRateLimit, GenerationJob, FeatureFlag, and ProviderConfig have no FK
  // to User (all are standalone, key-addressed tables — an idempotency
  // ledger, a hashed-IP rate-limit store, the durable job queue, and (Phase
  // 7 Task 3) the maintenance-mode flag / provider kill switch,
  // respectively), so they must be truncated explicitly — otherwise rows
  // from a prior test run survive and collide with fixed keys/ids used by
  // idempotency / rate-limit / job-claim / ops-flags tests (this exact gap
  // bit Phase 2 Task 9 with StripeEvent before it was added here).
  //
  // EDITSv1 Phase E8: SiteAnnouncement and PromoCode join that list for the
  // same reason — both are standalone catalog tables with no FK to User, so
  // campaigns and codes from a previous suite would otherwise survive and
  // show up in the next suite's listForViewer/validatePromo results.
  // AnnouncementDismissal and PromoRedemption hang off them by FK and go
  // with the CASCADE.
  await prisma.$executeRawUnsafe(
    `TRUNCATE "public"."User", "public"."StripeEvent", "public"."AnonRateLimit", "public"."GenerationJob", "public"."FeatureFlag", "public"."ProviderConfig", "public"."SiteAnnouncement", "public"."PromoCode", "public"."CmsEntry" RESTART IDENTITY CASCADE`
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
