import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Final provider stack:
//   KIE         — primary media provider (image/video/audio/lipsync)
//   Alibaba     — secondary media provider (DashScope/Qwen via MaaS)
//   OpenRouter  — LLM only (agent/chat); markup irrelevant to credit pricing
const PROVIDER_CONFIGS = [
  {
    name: "KIE",
    type: "image+video+audio+lipsync",
    apiKey: process.env.KIE_KEY || "",
    baseUrl: "https://api.kie.ai",
    isActive: true,
    markup: 2.5,
  },
  {
    name: "Alibaba",
    type: "image+video",
    apiKey: process.env.ALIBABA_KEY || "",
    baseUrl: process.env.ALIBABA_WORKSPACE_ID
      ? `https://${process.env.ALIBABA_WORKSPACE_ID}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1`
      : "https://dashscope.aliyuncs.com/compatible-mode/v1",
    isActive: true,
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

  console.log("\nSeeding ModelPricing from the static KIE model catalog...");

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
      const providerName = model.provider === "Alibaba" ? "Alibaba" : "KIE";
      const creditsCost = DEFAULT_CREDITS[category.type] || 1;
      await prisma.modelPricing.upsert({
        where: { modelId: model.id },
        update: { modelType: category.type, providerName, creditsCost, isActive: true },
        create: { modelId: model.id, modelType: category.type, providerName, providerCost: 0, creditsCost, isActive: true },
      });
      count++;
    }
  }
  console.log(`  ✓ ${count} models priced from static catalog (run the KIE sync for live pricing)`);

  console.log("\nDone.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Seed failed:", e);
  prisma.$disconnect();
  process.exit(1);
});
