import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const RATE_LIMITS = {
  "/api/generate/image": { window: 60000, max: 20 },
  "/api/generate/video": { window: 60000, max: 5 },
  "/api/generate/lipsync": { window: 60000, max: 5 },
  "/api/generate/audio": { window: 60000, max: 10 },
  "/api/agent": { window: 60000, max: 10 },
  "/api/workflow": { window: 60000, max: 5 },
  "/api/upload": { window: 60000, max: 30 },
};

// ── RBAC ──
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } });
  if (dbUser?.role !== "admin") throw new Error("Forbidden: admin access required");
  return user;
}

export async function isAdmin(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role === "admin";
}

// ── Rate limiting ──
export async function checkRateLimit(userId, endpoint) {
  const limit = RATE_LIMITS[endpoint];
  if (!limit) return { allowed: true };

  const windowStart = new Date(Date.now() - limit.window);
  const existing = await prisma.rateLimit.findUnique({
    where: { userId_endpoint: { userId, endpoint } },
  });

  if (!existing || existing.windowStart < windowStart) {
    await prisma.rateLimit.upsert({
      where: { userId_endpoint: { userId, endpoint } },
      create: { userId, endpoint, count: 1, windowStart: new Date() },
      update: { count: 1, windowStart: new Date() },
    });
    return { allowed: true, remaining: limit.max - 1 };
  }

  if (existing.count >= limit.max) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((existing.windowStart.getTime() + limit.window - Date.now()) / 1000) };
  }

  await prisma.rateLimit.update({
    where: { id: existing.id },
    data: { count: { increment: 1 } },
  });

  return { allowed: true, remaining: limit.max - existing.count - 1 };
}

// ── Validation ──
export function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== "string") return { valid: false, error: "Prompt is required" };
  if (prompt.length > 10000) return { valid: false, error: "Prompt too long (max 10000 chars)" };
  if (prompt.trim().length < 1) return { valid: false, error: "Prompt cannot be empty" };
  return { valid: true };
}

export function validateImageUrl(url) {
  if (!url) return { valid: true };
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return { valid: false, error: "Invalid URL protocol" };
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL" };
  }
}

// ── Audit logging ──
export async function logAudit(action, resource, resourceId, metadata = {}) {
  const user = await getCurrentUser().catch(() => null);
  const req = typeof window !== "undefined" ? null : null;
  await prisma.auditLog.create({
    data: {
      userId: user?.id || null,
      action,
      resource,
      resourceId,
      metadata,
    },
  }).catch(() => {});
}

// ── Abuse detection ──
export async function detectAbuse(userId) {
  const oneHourAgo = new Date(Date.now() - 3600000);
  const generations = await prisma.generation.count({
    where: { userId, createdAt: { gte: oneHourAgo } },
  });
  const failedGenerations = await prisma.generation.count({
    where: { userId, status: "failed", createdAt: { gte: oneHourAgo } },
  });

  if (generations > 100) return { flagged: true, reason: "Excessive generation volume" };
  if (failedGenerations > 50) return { flagged: true, reason: "High failure rate" };

  const refunds = await prisma.creditTransaction.count({
    where: { userId, type: "refund", createdAt: { gte: oneHourAgo } },
  });
  if (refunds > 20) return { flagged: true, reason: "Excessive refund requests" };

  return { flagged: false };
}