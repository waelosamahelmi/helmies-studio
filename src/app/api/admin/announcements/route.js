import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { authzResponse, AuthzError } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";
import { normalizeAudience, normalizePlacement, normalizeStyle } from "@/lib/announcements";

/* ══════════════════════════════════════════════════════════════════════════
   ADMIN — ANNOUNCEMENT CAMPAIGNS  (EDITSv1 Phase E8 Task E8.3)
   ──────────────────────────────────────────────────────────────────────────
   What this route could do before: create, flip isActive, delete. There was
   no EDIT — fixing a typo meant deleting the campaign (losing its metrics)
   and retyping it. The PATCH handler nominally accepted
   {message, style, link, isActive, endDate}, but the only caller in the app
   ever sent {id, isActive}, so the rest of that surface was untested and
   unreachable. It is replaced here by an explicit, validated PUT and a
   PATCH narrowed to the one thing it was actually used for.
   ══════════════════════════════════════════════════════════════════════════ */

// A date input sends "" for empty. `new Date("")` is Invalid Date, which
// Prisma will happily try to write.
function parseDate(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

// Plan slugs arrive from the admin form as a comma-separated string.
// Anything blank is dropped so a trailing comma cannot produce an ""
// target, which would match no plan and silently hide the campaign.
function parsePlanTargets(value) {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function parsePriority(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return 0;
  // Bounded on purpose: priority only has to order a handful of campaigns
  // against each other, and an unbounded integer from a form is a way to
  // pin something above everything forever by accident.
  return Math.max(-100, Math.min(100, n));
}

// Trimmed to null rather than "" — an empty string in ctaUrl would render a
// link that goes nowhere.
function text(value, max = 500) {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

// The single place that turns a request body into columns. Both POST and
// PUT go through it, so a field can never be writable on create and
// silently ignored on edit (which is how `audience` ended up write-only in
// the first place).
function campaignData(body) {
  const message = text(body.message, 500);
  if (!message) throw new AuthzError(400, "A message is required");

  return {
    message,
    title: text(body.title, 140),
    style: normalizeStyle(body.style),
    placement: normalizePlacement(body.placement),
    audience: normalizeAudience(body.audience),
    link: text(body.link, 2000),
    imageUrl: text(body.imageUrl, 2000),
    ctaLabel: text(body.ctaLabel, 60),
    ctaUrl: text(body.ctaUrl, 2000),
    dismissible: body.dismissible !== false,
    priority: parsePriority(body.priority),
    planTargets: parsePlanTargets(body.planTargets),
    startDate: parseDate(body.startDate, new Date()),
    endDate: parseDate(body.endDate, null),
  };
}

export async function GET(req) {
  try {
    await requireAdmin(req);
    const rows = await prisma.siteAnnouncement.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      // Dismissals are the third number the owner needs: a campaign with
      // impressions and no clicks reads very differently from one people
      // actively closed.
      include: { _count: { select: { dismissals: true } } },
    });
    return NextResponse.json(
      rows.map(({ _count, ...a }) => ({ ...a, dismissals: _count.dismissals })),
    );
  } catch (e) {
    return authzResponse(e);
  }
}

export async function POST(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);
    const body = await req.json();
    const created = await prisma.siteAnnouncement.create({
      data: { ...campaignData(body), isActive: body.isActive !== false },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return authzResponse(e);
  }
}

// Full edit. Every campaign field is settable; the metrics counters are
// NOT — impressions and clicks are facts about what happened, and an admin
// form has no business rewriting them.
export async function PUT(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);
    const body = await req.json();
    if (!body?.id || typeof body.id !== "string") throw new AuthzError(400, "id required");

    const data = campaignData(body);
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;

    const updated = await prisma.siteAnnouncement.update({ where: { id: body.id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    return authzResponse(e);
  }
}

// Narrowed to the live switch — the one thing PATCH was ever actually used
// for. Anything else is a PUT.
export async function PATCH(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);
    const body = await req.json();
    if (!body?.id || typeof body.id !== "string") throw new AuthzError(400, "id required");
    if (typeof body.isActive !== "boolean") throw new AuthzError(400, "isActive must be true or false");

    const updated = await prisma.siteAnnouncement.update({
      where: { id: body.id },
      data: { isActive: body.isActive },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return authzResponse(e);
  }
}

export async function DELETE(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new AuthzError(400, "id required");
    await prisma.siteAnnouncement.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}
