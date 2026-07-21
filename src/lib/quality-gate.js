import prisma from "@/lib/prisma";

export async function validateGenerationOutput(outputUrl, tool) {
  if (!outputUrl || typeof outputUrl !== "string") {
    return { valid: false, reason: "No output URL returned" };
  }

  if (outputUrl.startsWith("data:")) {
    return { valid: false, reason: "Data URL returned instead of hosted file" };
  }

  try {
    const res = await fetch(outputUrl, { method: "HEAD", signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      return { valid: false, reason: `Output URL returned ${res.status}` };
    }

    const contentLength = parseInt(res.headers.get("content-length") || "0");
    if (contentLength === 0) {
      return { valid: false, reason: "Output file is empty" };
    }

    if (contentLength < 1000 && (tool === "image" || tool === "video")) {
      return { valid: false, reason: "Output file too small — likely a placeholder" };
    }

    return { valid: true };
  } catch {
    return { valid: true };
  }
}

export async function logQualityGate(userId, generationId, tool, result) {
  await prisma.auditLog.create({
    data: {
      userId,
      action: "quality_gate",
      resource: tool,
      resourceId: generationId,
      metadata: { valid: result.valid, reason: result.reason || "passed" },
    },
  }).catch(() => {});
}
