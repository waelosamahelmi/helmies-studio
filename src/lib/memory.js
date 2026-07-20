import prisma from "@/lib/prisma";

// ── Create memory item ──
export async function createMemory(userId, type, name, data) {
  return prisma.projectMemory.create({ data: { userId, type, name, data } });
}

// ── Get all memories by type ──
export async function getMemories(userId, type) {
  return prisma.projectMemory.findMany({
    where: { userId, ...(type ? { type } : {}) },
    orderBy: { updatedAt: "desc" },
  });
}

// ── Get memory by ID ──
export async function getMemory(id, userId) {
  return prisma.projectMemory.findFirst({ where: { id, userId } });
}

// ── Update memory ──
export async function updateMemory(id, userId, data) {
  return prisma.projectMemory.updateMany({ where: { id, userId }, data: { data } });
}

// ── Delete memory ──
export async function deleteMemory(id, userId) {
  return prisma.projectMemory.deleteMany({ where: { id, userId } });
}

// ── Character memory helpers ──
export async function saveCharacter(userId, name, characterData) {
  return createMemory(userId, "character", name, characterData);
}

export async function getCharacters(userId) {
  return getMemories(userId, "character");
}

// ── Style memory helpers ──
export async function saveStyle(userId, name, styleData) {
  return createMemory(userId, "style", name, styleData);
}

export async function getStyles(userId) {
  return getMemories(userId, "style");
}

// ── Asset memory helpers ──
export async function saveAsset(userId, name, assetData) {
  return createMemory(userId, "asset", name, assetData);
}

export async function getAssets(userId) {
  return getMemories(userId, "asset");
}

// ── Brand memory helpers ──
export async function saveBrand(userId, name, brandData) {
  return createMemory(userId, "brand", name, brandData);
}

export async function getBrands(userId) {
  return getMemories(userId, "brand");
}

// ── Get generation history ──
export async function getGenerationHistory(userId, limit = 50, offset = 0) {
  return prisma.generation.findMany({
    where: { userId, status: "completed" },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

// ── Apply memory to prompt (inject character/style context) ──
export async function applyMemoryToPrompt(userId, prompt, options = {}) {
  let enhanced = prompt;

  if (options.characterId) {
    const character = await getMemory(options.characterId, userId);
    if (character) {
      const charData = character.data;
      const charDesc = typeof charData === "string" ? charData : Object.entries(charData).map(([k, v]) => `${k}: ${v}`).join(", ");
      enhanced = `${charDesc}. ${enhanced}`;
    }
  }

  if (options.styleId) {
    const style = await getMemory(options.styleId, userId);
    if (style) {
      const styleData = style.data;
      const styleDesc = typeof styleData === "string" ? styleData : Object.entries(styleData).map(([k, v]) => `${k}: ${v}`).join(", ");
      enhanced = `${enhanced}. Style: ${styleDesc}`;
    }
  }

  return enhanced;
}