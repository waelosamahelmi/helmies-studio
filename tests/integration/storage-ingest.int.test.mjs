import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { resetDb } from "./setup.mjs";

// Real DB (via resetDb) + the REAL local storage driver (no mock — this is
// the whole point: prove the converted call sites actually write to disk
// and the Generation row's outputUrl actually resolves through it). Only
// the external network boundaries are mocked: the provider SDK
// (submitOnly/pollProviderResult — no real KIE/Alibaba call) and global
// fetch (the one ingestFromUrl itself makes to download "provider" media) —
// same module-mocked-external-dependency + real-DB pattern already
// established in tests/integration/stripe-webhook.int.test.mjs (mocks the
// `stripe` SDK, keeps everything else real).
vi.mock("@/lib/providers", () => ({
  submitOnly: vi.fn(),
  pollProviderResult: vi.fn(),
  getProvider: vi.fn(),
}));

import { submitOnly, pollProviderResult, getProvider } from "@/lib/providers";

const MEDIA_DIR = path.join(process.cwd(), "public", "media");
const writtenKeys = [];

function fakeProviderResponse(bytes, contentType) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name) => {
        const n = name.toLowerCase();
        if (n === "content-type") return contentType;
        if (n === "content-length") return String(bytes.length);
        return null;
      },
    },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

let prisma;

beforeEach(async () => {
  prisma = await resetDb();
  vi.clearAllMocks();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  while (writtenKeys.length) {
    const key = writtenKeys.pop();
    await unlink(path.join(MEDIA_DIR, key)).catch(() => {});
  }
});

async function makeFundedUser(amount) {
  const { grantCredits } = await import("@/lib/wallet");
  const user = await prisma.user.create({ data: { email: `t-storageingest-${randomUUID()}@test.local` } });
  await grantCredits(user.id, amount, "signup", "Test opening balance");
  return user;
}

describe("runJob (async job path) — ingests the provider output through the real local driver", () => {
  it("writes the file to public/media, and the generation's outputUrl resolves it back byte-identically", async () => {
    const { enqueueJob } = await import("@/lib/job-queue");
    const { runJob } = await import("@/lib/job-runner");
    const { reserveCredits } = await import("@/lib/wallet");

    const user = await makeFundedUser(100);
    const generation = await prisma.generation.create({
      data: { userId: user.id, tool: "image", model: "test-model", prompt: "a storage-ingest int test", creditsUsed: 10 },
    });
    await reserveCredits(user.id, 10, generation.id);

    const job = await enqueueJob({
      generationId: generation.id,
      userId: user.id,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: { prompt: "x" },
      providerName: "kie",
      endpoint: "/v1/generate",
    });

    const fakeBytes = Buffer.from("real-local-driver integration test payload bytes");
    submitOnly.mockResolvedValue({ provider: { name: "kie", getKey: () => "k" }, requestId: "req_int_1", submitData: {} });
    getProvider.mockReturnValue({ name: "kie", getKey: () => "k" });
    pollProviderResult.mockResolvedValue({ outputs: ["https://provider.example/fake-output.webp"] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeProviderResponse(fakeBytes, "image/webp")));

    const result = await runJob(job, { workerId: "worker-int-1" });
    expect(result).toEqual({ outcome: "succeeded" });

    const generationAfter = await prisma.generation.findUnique({ where: { id: generation.id } });
    expect(generationAfter.status).toBe("completed");
    expect(generationAfter.outputUrl).toMatch(/^\/api\/media\/local\/[0-9a-f]{16}-[0-9a-f]{8}\.webp$/);

    const key = generationAfter.outputUrl.replace("/api/media/local/", "");
    writtenKeys.push(key);
    const onDisk = await readFile(path.join(MEDIA_DIR, key));
    expect(onDisk).toEqual(fakeBytes);

    const jobAfter = await prisma.generationJob.findUnique({ where: { id: job.id } });
    expect(jobAfter.status).toBe("succeeded");

    // Settled (not released/refunded): the reserved 10 credits are now
    // permanently spent — available stays at 100-10=90, reserved drops to 0.
    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(90);
    expect(wallet.reserved).toBe(0);
  });
});

describe("handleGenerationWebhook (webhook path) — ingests the provider output through the real local driver", () => {
  it("writes the file to public/media, and the generation's outputUrl resolves it back byte-identically", async () => {
    const { handleGenerationWebhook } = await import("@/lib/generation-webhook");
    const { reserveCredits } = await import("@/lib/wallet");

    const user = await makeFundedUser(100);
    const generation = await prisma.generation.create({
      data: {
        userId: user.id, tool: "image", model: "test-model",
        prompt: "a storage-ingest webhook int test", creditsUsed: 8,
        requestId: "req_int_webhook_1", status: "processing",
      },
    });
    await reserveCredits(user.id, 8, generation.id);

    const fakeBytes = Buffer.from("webhook path real-local-driver integration bytes");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeProviderResponse(fakeBytes, "image/webp")));

    const { status, response } = await handleGenerationWebhook({
      request_id: "req_int_webhook_1",
      status: "completed",
      outputs: ["https://provider.example/fake-webhook-output.webp"],
    });

    expect(status).toBe(200);
    expect(response).toMatchObject({ success: true, downloaded: true });

    const generationAfter = await prisma.generation.findUnique({ where: { id: generation.id } });
    expect(generationAfter.status).toBe("completed");
    expect(generationAfter.outputUrl).toMatch(/^\/api\/media\/local\/[0-9a-f]{16}-[0-9a-f]{8}\.webp$/);

    const key = generationAfter.outputUrl.replace("/api/media/local/", "");
    writtenKeys.push(key);
    const onDisk = await readFile(path.join(MEDIA_DIR, key));
    expect(onDisk).toEqual(fakeBytes);

    // Settled (not released/refunded): the reserved 8 credits are now
    // permanently spent — available stays at 100-8=92, reserved drops to 0.
    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(92);
    expect(wallet.reserved).toBe(0);
  });

  it("falls back to the raw provider url (never throws, never 500s) when the download itself fails", async () => {
    const { handleGenerationWebhook } = await import("@/lib/generation-webhook");
    const { reserveCredits } = await import("@/lib/wallet");

    const user = await makeFundedUser(100);
    const generation = await prisma.generation.create({
      data: {
        userId: user.id, tool: "image", model: "test-model",
        prompt: "a storage-ingest webhook failure int test", creditsUsed: 4,
        requestId: "req_int_webhook_2", status: "processing",
      },
    });
    await reserveCredits(user.id, 4, generation.id);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));

    const { status, response } = await handleGenerationWebhook({
      request_id: "req_int_webhook_2",
      status: "completed",
      outputs: ["https://provider.example/unreachable.webp"],
    });

    expect(status).toBe(200);
    expect(response).toMatchObject({ success: true, downloaded: true });

    const generationAfter = await prisma.generation.findUnique({ where: { id: generation.id } });
    expect(generationAfter.status).toBe("completed");
    // Fell back to the raw provider url — not a local path.
    expect(generationAfter.outputUrl).toBe("https://provider.example/unreachable.webp");
  });
});
