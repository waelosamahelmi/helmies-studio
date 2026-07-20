import prisma from "@/lib/prisma";
import crypto from "crypto";

export async function authenticateApiKey(req) {
  const authHeader = req.headers.get("authorization") || req.headers.get("x-api-key");
  if (!authHeader) return null;

  const token = authHeader.replace(/^Bearer\s+/i, "").replace(/^x-api-key:\s*/i, "").trim();
  if (!token) return null;

  const keyHash = crypto.createHash("sha256").update(token).digest("hex");

  const apiKey = await prisma.apiKey.findFirst({
    where: { keyHash, isActive: true },
    include: { user: { select: { id: true, email: true, credits: true, role: true } } },
  });

  if (!apiKey) return null;

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  return apiKey.user;
}
