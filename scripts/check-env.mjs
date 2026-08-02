#!/usr/bin/env node
// Verifies required env vars are set (values never printed) and that
// .env.example documents every variable the code references.
import { readFileSync } from "node:fs";
import "dotenv/config";

const REQUIRED = [
  "DATABASE_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "KIE_KEY",
  "WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
];

// The S3 storage driver (src/lib/storage/s3-driver.js, Phase 4B Task 2) is
// opt-in via STORAGE_DRIVER=s3 — its config vars are only REQUIRED when that
// driver is actually selected. S3_PUBLIC_BASE_URL is intentionally excluded
// here: it's always optional, even with STORAGE_DRIVER=s3 — putObject
// always returns a stable app-relative URL regardless of whether it's set
// (see s3-driver.js's putObject comment).
if ((process.env.STORAGE_DRIVER || "local").toLowerCase() === "s3") {
  REQUIRED.push("S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY");
}

const missing = REQUIRED.filter((name) => !process.env[name]);
const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const undocumented = REQUIRED.filter((name) => !example.includes(name));

if (undocumented.length) {
  console.error(`Missing from .env.example: ${undocumented.join(", ")}`);
}
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(", ")}`);
}
if (missing.length || undocumented.length) process.exit(1);
console.log(`check-env: all ${REQUIRED.length} required vars present and documented.`);
