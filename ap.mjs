import "dotenv/config";
import { resolveProvider, submitOnly } from "./src/lib/providers.js";
import prisma from "./src/lib/prisma.js";
const rows = await prisma.modelPricing.findMany({
  where: { isActive: true, isDeprecated: false, modelType: "audio" },
  orderBy: { creditsCost: "asc" },
});
console.log(`Testing ${rows.length} active audio models...\n`);
for (const row of rows) {
  const ep = row.endpoint || row.providerModelId || row.modelId;
  const body = { model: ep, prompt: "an uplifting cinematic orchestral theme", text: "Helmies Studio. Create anything." };
  try {
    const p = await resolveProvider(row.modelId);
    const r = await submitOnly(p, ep, body);
    console.log(`CALLABLE  ${row.modelId.padEnd(34)} ${row.creditsCost}cr  req=${r.requestId || "immediate"}`);
  } catch (e) {
    console.log(`rejected  ${row.modelId.padEnd(34)} ${e.message.slice(0, 44)}`);
  }
}
process.exit(0);
