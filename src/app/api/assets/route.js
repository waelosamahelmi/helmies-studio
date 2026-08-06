import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const cursor = searchParams.get("cursor");
    const includeGenerations = searchParams.get("includeGenerations") !== "false"; // default true
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    const where = { userId: user.id, isDeleted: false };
    if (type && type !== "all") where.type = type;
    const assets = await prisma.asset.findMany({ where, orderBy: { createdAt: "desc" }, take: limit + 1, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    const hasMore = assets.length > limit;
    if (hasMore) assets.pop();

    /* Merge completed generations alongside uploaded assets so the library
       is a single view of everything the user has made. Map each generation
       to an asset-shaped object the client already knows how to render. */
    let generations = [];
    let totalHasMore = hasMore;
    if (includeGenerations && (!type || type === "all")) {
      const genWhere = {
        userId: user.id,
        status: "succeeded",
        outputUrl: { not: null },
      };
      const genTotal = await prisma.generation.count({ where: genWhere });
      const genLimit = Math.min(limit - assets.length + (hasMore ? 1 : 0), 50);
      if (genLimit > 0) {
        const genRows = await prisma.generation.findMany({
          where: genWhere,
          orderBy: { createdAt: "desc" },
          take: genLimit,
        });
        generations = genRows.map((g) => {
          const t = String(g.tool || "").toLowerCase();
          const kind = t === "video" ? "video" : t === "music" || t === "audio" ? "audio" : "image";
          return {
            id: `gen-${g.id}`,
            type: kind,
            source: "generation",
            url: g.outputUrl,
            thumbnailUrl: g.outputUrl,
            name: (g.prompt || `Generated ${g.tool}`).slice(0, 80),
            model: g.model,
            metadata: { creditsUsed: g.creditsUsed },
            createdAt: g.createdAt,
            generationId: g.id,
            isFavorite: false,
            bytes: 0,
          };
        });
      }
      totalHasMore = hasMore || generations.length >= genLimit;
    }

    /* Merge and re-sort by date descending */
    const merged = [...assets.map((a) => ({ ...a, _source: "asset" })), ...generations.map((g) => ({ ...g, _source: "generation" }))]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);

    const nextCursor = totalHasMore && merged.length ? merged[merged.length - 1].id : null;
    return NextResponse.json({ assets: merged, hasMore: totalHasMore, nextCursor });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);
    const body = await req.json();
    const asset = await prisma.asset.create({ data: { userId: user.id, type: body.type || "image", source: body.source || "upload", url: body.url, thumbnailUrl: body.thumbnailUrl, name: body.name, mimeType: body.mimeType, bytes: body.bytes || 0, width: body.width, height: body.height, duration: body.duration, model: body.model, generationId: body.generationId, parentAssetId: body.parentAssetId, metadata: body.metadata || {} } });
    return NextResponse.json(asset, { status: 201 });
  } catch (e) { return authzResponse(e); }
}

export async function PATCH(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);
    const body = await req.json();
    const asset = await prisma.asset.findFirst({ where: { id: body.id, userId: user.id } });
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await prisma.asset.update({ where: { id: body.id }, data: { isFavorite: body.isFavorite } });
    return NextResponse.json(updated);
  } catch (e) { return authzResponse(e); }
}

export async function DELETE(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    /* Generation-backed rows (id starts with "gen-") are read-only in the
       asset library — the generation is the source of truth. */
    if (id.startsWith("gen-")) return NextResponse.json({ error: "Generations cannot be deleted from the library. Delete the generation instead." }, { status: 422 });
    // Scope by owner: updateMany silently no-ops on someone else's asset.
    const res = await prisma.asset.updateMany({ where: { id, userId: user.id }, data: { isDeleted: true } });
    if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) { return authzResponse(e); }
}
