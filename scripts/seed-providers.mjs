import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PROVIDER_CONFIGS = [
  {
    name: "WaveSpeed",
    type: "image+video+audio+lipsync",
    apiKey: process.env.WAVESPEED_KEY || "",
    baseUrl: "https://api.wavespeed.ai",
    isActive: true,
    markup: 1.25,
  },
  {
    name: "Atlas Cloud",
    type: "image+video",
    apiKey: process.env.ATLAS_KEY || "",
    baseUrl: "https://api.atlascloud.ai",
    isActive: true,
    markup: 2.5,
  },
  {
    name: "Alibaba Cloud (Qwen)",
    type: "image+video+llm",
    apiKey: process.env.ALIBABA_KEY || "",
    baseUrl: process.env.ALIBABA_WORKSPACE_ID
      ? `https://${process.env.ALIBABA_WORKSPACE_ID}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1`
      : "https://dashscope.aliyuncs.com",
    isActive: !!process.env.ALIBABA_KEY,
    markup: 2.5,
  },
  {
    name: "OpenRouter",
    type: "llm",
    apiKey: process.env.OPENROUTER_KEY || "",
    baseUrl: "https://openrouter.ai/api/v1",
    isActive: true,
    markup: 1.0,
  },
];

const CREDIT_TO_EUR = 0.01;

function calculateCredits(providerCost, markup = 1.25) {
  const credits = Math.ceil((providerCost * markup) / CREDIT_TO_EUR);
  return Math.max(1, credits);
}

async function syncWaveSpeedPricing(markup = 1.25) {
  const key = process.env.WAVESPEED_KEY;
  if (!key) {
    console.log("  ○ No WAVESPEED_KEY set, using static defaults");
    return null;
  }

  console.log("  Fetching models from WaveSpeed API...");
  const res = await fetch("https://api.wavespeed.ai/api/v3/models", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    console.log(`  ○ API returned ${res.status}, using static defaults`);
    return null;
  }
  const body = await res.json();
  if (body.code !== 200) {
    console.log("  ○ API response error, using static defaults");
    return null;
  }
  const models = body.data || [];
  console.log(`  ✓ ${models.length} models fetched`);

  let synced = 0;
  for (const m of models) {
    try {
      const pricingRes = await fetch("https://api.wavespeed.ai/api/v3/model/pricing", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: m.model_id, inputs: {} }),
        signal: AbortSignal.timeout(15000),
      });
      if (!pricingRes.ok) continue;
      const pricingBody = await pricingRes.json();
      if (pricingBody.code !== 200) continue;
      const cost = pricingBody.data?.cost || pricingBody.data?.total_cost || 0;
      const creditsCost = calculateCredits(cost, markup);

      await prisma.modelPricing.upsert({
        where: { modelId: m.model_id },
        create: {
          modelId: m.model_id,
          modelType: m.type || "image",
          providerName: "WaveSpeed",
          providerCost: cost,
          creditsCost,
          isActive: true,
        },
        update: { providerCost: cost, creditsCost, isActive: true },
      });
      synced++;
    } catch {
      continue;
    }
  }
  console.log(`  ✓ ${synced} models priced from live API`);
  return synced;
}

async function main() {
  console.log("Seeding ProviderConfig...");
  for (const config of PROVIDER_CONFIGS) {
    await prisma.providerConfig.upsert({
      where: { name: config.name },
      update: config,
      create: config,
    });
    console.log(`  ${config.isActive ? "✓" : "○"} ${config.name} (${config.type})`);
  }

  console.log("\nSeeding ModelPricing...");

  const synced = await syncWaveSpeedPricing(1.25);
  if (synced === null) {
    // Fallback to static pricing if WaveSpeed API unavailable
    const { IMAGE_MODELS, I2I_MODELS, VIDEO_MODELS, I2V_MODELS, V2V_MODELS, LIPSYNC_MODELS, RECAST_MODELS, AUDIO_MODELS } = await import("../src/lib/models.js");
    const MODEL_CATEGORIES = [
      { models: IMAGE_MODELS, type: "image" },
      { models: I2I_MODELS, type: "i2i" },
      { models: VIDEO_MODELS, type: "video" },
      { models: I2V_MODELS, type: "i2v" },
      { models: V2V_MODELS, type: "v2v" },
      { models: LIPSYNC_MODELS, type: "lipsync" },
      { models: RECAST_MODELS, type: "recast" },
      { models: AUDIO_MODELS, type: "audio" },
    ];

    const DEFAULT_CREDITS = {
      image: 2, i2i: 3, video: 10, i2v: 12, v2v: 8,
      lipsync: 8, recast: 12, audio: 5,
    };

    let count = 0;
    for (const category of MODEL_CATEGORIES) {
      for (const model of category.models) {
        const providerName = model.provider === "Alibaba" ? "Alibaba Cloud (Qwen)" : "WaveSpeed";
        const creditsCost = DEFAULT_CREDITS[category.type] || 1;
        await prisma.modelPricing.upsert({
          where: { modelId: model.id },
          update: { modelType: category.type, providerName, creditsCost, isActive: true },
          create: { modelId: model.id, modelType: category.type, providerName, providerCost: 0, creditsCost, isActive: true },
        });
        count++;
      }
    }
    console.log(`  ✓ ${count} models priced (static fallback)`);
  }

  console.log("\nDone.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Seed failed:", e);
  prisma.$disconnect();
  process.exit(1);
});
