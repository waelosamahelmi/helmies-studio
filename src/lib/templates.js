// Helmies Studio — Template Marketplace Library

import prisma from "./prisma.js";

// ── Public list: published templates, ordered featured → newest ──
export async function listTemplates({ category, toolType, featured, limit = 24, offset = 0 } = {}) {
  const where = { isPublished: true };
  if (category) where.category = category;
  if (toolType) where.toolType = toolType;
  if (featured !== undefined) where.isFeatured = featured;

  const [templates, total] = await Promise.all([
    prisma.template.findMany({
      where,
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      take: limit,
      skip: offset,
    }),
    prisma.template.count({ where }),
  ]);

  return { templates, total };
}

// ── Single template by slug ──
export async function getTemplateBySlug(slug) {
  return prisma.template.findUnique({
    where: { slug },
  });
}

// ── User's purchased templates (with template details) ──
export async function getUserTemplates(userId) {
  const purchases = await prisma.templatePurchase.findMany({
    where: { userId },
    include: { template: true },
    orderBy: { purchasedAt: "desc" },
  });
  return purchases;
}

// ── Check if user has active access to a template ──
export async function hasTemplateAccess(userId, templateSlug) {
  const template = await prisma.template.findUnique({
    where: { slug: templateSlug },
    select: { id: true },
  });
  if (!template) return false;

  const purchase = await prisma.templatePurchase.findUnique({
    where: {
      userId_templateId: { userId, templateId: template.id },
    },
  });

  if (!purchase) return false;
  // If usageRemaining is a finite number and it's 0, access is exhausted
  if (purchase.usageRemaining !== null && purchase.usageRemaining <= 0) return false;
  return true;
}

// ── Record a usage event. Decrements usageRemaining if finite. ──
export async function recordTemplateUse(purchaseId, generationId) {
  return prisma.$transaction(async (tx) => {
    // Create the usage record
    await tx.templateUsage.create({
      data: { purchaseId, generationId: generationId || null },
    });

    // Increment totalUses and conditionally decrement usageRemaining
    const purchase = await tx.templatePurchase.findUnique({
      where: { id: purchaseId },
      select: { usageRemaining: true },
    });

    const updateData = {
      totalUses: { increment: 1 },
      lastUsedAt: new Date(),
    };

    if (purchase?.usageRemaining !== null && purchase.usageRemaining > 0) {
      updateData.usageRemaining = { decrement: 1 };
    }

    return tx.templatePurchase.update({
      where: { id: purchaseId },
      data: updateData,
    });
  });
}

// ── Create a purchase record, idempotent via unique constraint ──
export async function createTemplatePurchase(
  userId,
  templateId,
  purchaseType,
  { stripeSessionId, stripePricePaid } = {}
) {
  // Upsert so repeated calls are safe
  return prisma.templatePurchase.upsert({
    where: {
      userId_templateId: { userId, templateId },
    },
    update: {}, // no-op on duplicate — keep original purchase
    create: {
      userId,
      templateId,
      purchaseType,
      stripeSessionId: stripeSessionId || null,
      stripePricePaid: stripePricePaid || null,
      usageRemaining:
        purchaseType === "onetime" ? 1 : purchaseType === "subscription_included" ? null : null,
    },
  });
}
