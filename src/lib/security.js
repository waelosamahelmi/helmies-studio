import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { requireAdminUser } from "@/lib/authz";
import { checkAnonLimit } from "@/lib/rate-limit";

// NOTE: checkRateLimit is a no-op for any endpoint missing from this map, so a
// key must exist for every path passed to it. generation-handler.js builds
// `/api/generate/${tool}` for every tool in the registry.
const RATE_LIMITS = {
  // Image-class tools
  "/api/generate/image": { window: 60000, max: 20 },
  "/api/generate/i2i": { window: 60000, max: 20 },
  "/api/generate/marketing": { window: 60000, max: 20 },
  "/api/generate/influencer": { window: 60000, max: 20 },
  // Video-class tools (expensive)
  "/api/generate/video": { window: 60000, max: 5 },
  "/api/generate/i2v": { window: 60000, max: 5 },
  "/api/generate/v2v": { window: 60000, max: 5 },
  "/api/generate/cinema": { window: 60000, max: 5 },
  "/api/generate/recast": { window: 60000, max: 5 },
  "/api/generate/motion": { window: 60000, max: 5 },
  "/api/generate/clipping": { window: 60000, max: 5 },
  "/api/generate/lipsync": { window: 60000, max: 5 },
  // Audio
  "/api/generate/audio": { window: 60000, max: 10 },
  // Async submission path
  "/api/generate/async": { window: 60000, max: 20 },
  // Non-generation endpoints
  "/api/analyze": { window: 60000, max: 20 },
  "/api/prompt": { window: 60000, max: 30 },
  "/api/agent": { window: 60000, max: 10 },
  "/api/workflow": { window: 60000, max: 5 },
  "/api/workflow/regen": { window: 60000, max: 10 },
  "/api/upload": { window: 60000, max: 30 },
  // Public form — keyed by IP for signed-out visitors.
  "/api/contact": { window: 600000, max: 5 },
};

// ── RBAC ──
// Thin delegate onto the central authz module (src/lib/authz.js) so the 21
// admin routes importing `requireAdmin` from here keep working unchanged.
// It now throws AuthzError (401 unauthenticated / 403 non-admin) instead of
// a plain Error — callers must catch with `authzResponse(e)`, not
// `{ error: e.message }`.
export async function requireAdmin(req) {
  return requireAdminUser(req);
}

export async function isAdmin(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role === "admin";
}

// ── Rate limiting ──
// Anonymous callers can't be rows in RateLimit (userId is a User FK). The
// `ip:` path below delegates to the durable, hashed-IP store in
// @/lib/rate-limit (Phase 3 Task 4) — no per-instance in-memory state.
export async function checkRateLimit(userId, endpoint) {
  const limit = RATE_LIMITS[endpoint];
  if (!limit) return { allowed: true };

  if (typeof userId === "string" && userId.startsWith("ip:")) {
    const ip = userId.slice(3);
    return checkAnonLimit(ip, endpoint, { windowMs: limit.window, max: limit.max });
  }

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
export async function logAudit(action, resource, resourceId, metadata = {}, req) {
  const user = await (req ? getCurrentUser(req) : getCurrentUser()).catch(() => null);
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

  const refunds = await prisma.creditLedger.count({
    where: { wallet: { userId }, type: "refund", createdAt: { gte: oneHourAgo } },
  });
  if (refunds > 20) return { flagged: true, reason: "Excessive refund requests" };

  return { flagged: false };
}