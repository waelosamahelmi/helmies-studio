import "dotenv/config";
import prisma from "./src/lib/prisma.js";
import { reserveCredits, getWallet } from "./src/lib/wallet.js";
import { enqueueJob } from "./src/lib/job-queue.js";
import { resolveProvider } from "./src/lib/providers.js";
import crypto from "crypto";
const USER = "cms2h2mk7000081ktuthta9sb";
for (const j of JSON.parse(process.argv[2])) {
  const row = await prisma.modelPricing.findUnique({ where: { modelId: j.model } });
  if (!row) { console.log(`SKIP ${j.model}`); continue; }
  const endpoint = row.endpoint || row.providerModelId || row.modelId;
  const provider = await resolveProvider(j.model);
  const params = { model: endpoint, prompt: j.prompt || "", ...(j.extra || {}) };
  const gen = await prisma.generation.create({ data: { userId: USER, tool: j.tool, model: row.modelId,
    prompt: j.prompt || "", params, status: "pending", creditsUsed: row.creditsCost, providerCost: row.providerCost || 0 } });
  await reserveCredits(USER, row.creditsCost, gen.id);
  await enqueueJob({ generationId: gen.id, userId: USER,
    idempotencyKey: crypto.createHash("sha256").update(`${USER}:${row.modelId}:${gen.id}`).digest("hex"),
    payload: params, providerName: provider.name, endpoint });
  console.log(`QUEUED ${row.modelId} gen=${gen.id}`);
}
process.exit(0);
