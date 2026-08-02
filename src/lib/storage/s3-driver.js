// S3-compatible storage driver (Phase 4B Task 2). AWS Signature Version 4,
// hand-rolled with node:crypto's createHmac/createHash — no AWS SDK, no new
// npm dependency. Implements exactly the four object operations plus
// getSignedUrl (same contract as src/lib/storage/local-driver.js): no
// multipart upload, no bucket listing.
//
// *** LIVE PATH BLOCKED ***: this driver has never run against a real
// S3-compatible endpoint — no credentials are available in this
// environment. Every behavior here is verified against a MOCKED fetch
// (tests/unit/storage-s3.test.mjs), including a known-answer SigV4
// signature test computed independently from the AWS spec. Do not treat
// this as live-verified; see the Task 2 report for the explicit
// BLOCKED-for-live statement.
//
// Path-style addressing — bucket in the URL path, not a virtual-hosted
// subdomain — so this targets MinIO/R2/Backblaze/etc. unmodified, not just
// AWS S3: every operation hits `${S3_ENDPOINT}/${S3_BUCKET}/${key}`.
//
// Config, read from process.env at call time (never cached, so flipping
// STORAGE_DRIVER/S3_* between calls — e.g. in tests — takes effect
// immediately):
//   S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID,
//   S3_SECRET_ACCESS_KEY (required when this driver is actually invoked),
//   S3_PUBLIC_BASE_URL (optional — see getObjectUrl below).
//
// Plain-node safe: reachable from scripts/worker.mjs transitively via
// src/lib/job-runner.js -> storage/ingest.js -> storage/index.js -> here —
// no "@/" alias, no extensionless relative import.
import { createHmac, createHash } from "node:crypto";

const SERVICE = "s3";
const ALGORITHM = "AWS4-HMAC-SHA256";

function config() {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL || null;

  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3 driver is active (STORAGE_DRIVER=s3) but one or more of S3_ENDPOINT, S3_REGION, " +
      "S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY is unset."
    );
  }
  return { endpoint: endpoint.replace(/\/$/, ""), region, bucket, accessKeyId, secretAccessKey, publicBaseUrl };
}

function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key, data) {
  return createHmac("sha256", key).update(data).digest();
}

// SigV4's canonical encoding is RFC 3986 with NO exceptions — JS's
// encodeURIComponent leaves ! ' ( ) * unescaped (they're valid in a URI per
// RFC 3986's "unreserved"/"sub-delims" carve-outs elsewhere), which is the
// classic hand-rolled-SigV4 bug: AWS's canonical form requires those five
// percent-encoded too, or every signature is silently wrong.
function rfc3986Encode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function canonicalUri(bucket, key) {
  return "/" + [bucket, ...key.split("/")].map(rfc3986Encode).join("/");
}

function amzDateParts() {
  const iso = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""); // -> 20240615T103000Z
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function signingKey(secretAccessKey, dateStamp, region) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

// Header-signed request (PUT/GET/DELETE/HEAD): the payload is fully
// buffered and hashed up front (SHA-256 of the whole body, no
// chunked/streaming signing) and the signature rides in the Authorization
// header alongside x-amz-content-sha256 and x-amz-date.
function signRequest({ method, bucket, key, region, accessKeyId, secretAccessKey, host, payload }) {
  const { amzDate, dateStamp } = amzDateParts();
  const payloadHash = sha256Hex(payload ?? Buffer.alloc(0));
  const uri = canonicalUri(bucket, key);

  const headersObj = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const signedHeaders = Object.keys(headersObj).sort().join(";");
  const canonicalHeaders = Object.keys(headersObj).sort().map((h) => `${h}:${headersObj[h]}\n`).join("");

  const canonicalRequest = [method, uri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(signingKey(secretAccessKey, dateStamp, region), stringToSign).toString("hex");

  return {
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization: `${ALGORITHM} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function request(method, key, { body, contentType } = {}) {
  const { endpoint, region, bucket, accessKeyId, secretAccessKey } = config();
  const host = new URL(endpoint).host;
  const payload = body ?? Buffer.alloc(0);

  const signedHeaders = signRequest({ method, bucket, key, region, accessKeyId, secretAccessKey, host, payload });
  const headers = { ...signedHeaders };
  if (contentType) headers["Content-Type"] = contentType;

  const hasBody = method === "PUT" || method === "POST";
  return fetch(`${endpoint}${canonicalUri(bucket, key)}`, {
    method,
    headers,
    body: hasBody ? payload : undefined,
  });
}

// putObject/getObject's plain `url`: a configured public base (e.g. a CDN
// in front of the bucket) when set, otherwise a presigned URL — matching
// the brief's "S3_PUBLIC_BASE_URL (optional; when absent getSignedUrl
// returns a presigned URL)".
function publicOrSignedUrl(key) {
  const { publicBaseUrl } = config();
  if (publicBaseUrl) return `${publicBaseUrl.replace(/\/$/, "")}/${key}`;
  return getSignedUrl(key, 3600);
}

export async function putObject(key, buffer, contentType) {
  const res = await request("PUT", key, { body: buffer, contentType });
  if (!res.ok) {
    throw new Error(`S3 putObject failed: ${res.status} ${res.statusText || ""}`.trim());
  }
  return { key, url: publicOrSignedUrl(key) };
}

// Returns { buffer, contentType } or null on a 404 — never throws for
// "not found", so storage/ingest.js and the serving route (Task 3) can
// treat a missing object as a normal, expected outcome (e.g. Task 3's
// local-filesystem fallback) rather than an error path.
export async function getObject(key) {
  const res = await request("GET", key);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`S3 getObject failed: ${res.status} ${res.statusText || ""}`.trim());
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType: res.headers.get("content-type") || null };
}

export async function deleteObject(key) {
  const res = await request("DELETE", key);
  return res.ok || res.status === 404;
}

export async function exists(key) {
  const res = await request("HEAD", key);
  return res.ok;
}

// Query-string-signed presigned URL (SigV4 "presigned URL" form, distinct
// from the header-signed form the other four operations use) — payload is
// never read for a presigned GET, so the payload hash is the literal
// UNSIGNED-PAYLOAD sentinel the spec defines for this case, not a real hash.
export function getSignedUrl(key, ttlSeconds = 3600) {
  const { endpoint, region, bucket, accessKeyId, secretAccessKey } = config();
  const host = new URL(endpoint).host;
  const { amzDate, dateStamp } = amzDateParts();
  const credentialScope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;

  const queryParams = {
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(ttlSeconds),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${rfc3986Encode(k)}=${rfc3986Encode(queryParams[k])}`)
    .join("&");

  const uri = canonicalUri(bucket, key);
  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = ["GET", uri, canonicalQueryString, canonicalHeaders, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = [ALGORITHM, amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(signingKey(secretAccessKey, dateStamp, region), stringToSign).toString("hex");

  return `${endpoint}${uri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}
