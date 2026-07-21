import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  IMAGE_MODELS, I2I_MODELS, VIDEO_MODELS, I2V_MODELS,
  V2V_MODELS, LIPSYNC_MODELS, RECAST_MODELS, AUDIO_MODELS,
} from "../src/lib/models.js";

const prisma = new PrismaClient();

const PROVIDER_CONFIGS = [
  {
    name: "WaveSpeed",
    type: "image+video+audio+lipsync",
    apiKey: process.env.WAVESPEED_KEY || "",
    baseUrl: "https://api.wavespeed.ai",
    isActive: true,
    markup: 2.5,
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
  image: 1,
  i2i: 2,
  video: 5,
  i2v: 6,
  v2v: 6,
  lipsync: 8,
  recast: 10,
  audio: 3,
};

const DEFAULT_PROVIDER_COST = {
  image: 0.004,
  i2i: 0.008,
  video: 0.02,
  i2v: 0.024,
  v2v: 0.024,
  lipsync: 0.032,
  recast: 0.04,
  audio: 0.012,
};

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
  let count = 0;
  for (const category of MODEL_CATEGORIES) {
    for (const model of category.models) {
      const providerName = model.provider === "Alibaba" ? "Alibaba Cloud (Qwen)" : "WaveSpeed";
      const creditsCost = DEFAULT_CREDITS[category.type] || 1;
      const providerCost = DEFAULT_PROVIDER_COST[category.type] || 0.004;

      await prisma.modelPricing.upsert({
        where: { modelId: model.id },
        update: {
          modelType: category.type,
          providerName,
          providerCost,
          creditsCost,
          isActive: true,
        },
        create: {
          modelId: model.id,
          modelType: category.type,
          providerName,
          providerCost,
          creditsCost,
          isActive: true,
        },
      });
      count++;
    }
  }
  console.log(`  ✓ ${count} models priced`);

  console.log("\nDone. resolveProvider() will now route to WaveSpeed instead of falling back.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Seed failed:", e);
  prisma.$disconnect();
  process.exit(1);
});
