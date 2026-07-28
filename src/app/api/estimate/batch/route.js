import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { estimateCredits } from "@/lib/pricing-engine";
import prisma from "@/lib/prisma";

// Batch estimate — returns costs for all models of a given tool type
export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { tool, models } = await req.json();
    
    // models is an array of { model, params } objects
    // If not provided, we'll look up all models of this tool type from DB
    let modelList = models;
    
    if (!modelList && tool) {
      // Fetch all models of this tool type from DB
      const typeMap = {
        image: "image", i2i: "i2i", video: "video", i2v: "i2v", v2v: "v2v",
        lipsync: "lipsync", audio: "audio", recast: "recast",
      };
      const dbType = typeMap[tool] || tool;
      const entries = await prisma.modelPricing.findMany({
        where: { modelType: dbType, isActive: true },
        select: { modelId: true, creditsCost: true, providerCost: true },
      });
      modelList = entries.map((e) => ({ model: e.modelId, credits: e.creditsCost }));
    }

    if (!modelList || !Array.isArray(modelList)) {
      return NextResponse.json({ error: "models array or tool required" }, { status: 400 });
    }

    // Get user balance once
    const userRow = await prisma.user.findUnique({ where: { id: user.id }, select: { credits: true } });
    const balance = userRow?.credits || 0;

    // Build cost map — use DB pricing if available, otherwise estimate
    const costs = {};
    for (const item of modelList) {
      const modelId = item.model || item.modelId;
      if (!modelId) continue;
      
      // If credits already provided from DB, use it
      if (item.credits) {
        costs[modelId] = {
          credits: item.credits,
          affordable: balance >= item.credits,
        };
      } else {
        // Estimate from pricing engine
        try {
          const credits = await estimateCredits(tool || "image", modelId, item.params || {});
          costs[modelId] = {
            credits,
            affordable: balance >= credits,
          };
        } catch {
          costs[modelId] = { credits: null, affordable: false, error: "estimate_unavailable" };
        }
      }
    }

    return NextResponse.json({
      costs,
      balance,
      timestamp: Date.now(),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}