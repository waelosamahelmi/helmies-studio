import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserTemplates } from "@/lib/templates";

// GET /api/templates/library — user's purchased templates
export async function GET(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const purchases = await getUserTemplates(session.user.id);

    // Flatten: return template details + purchase info
    const items = purchases.map((p) => ({
      ...p.template,
      purchase: {
        id: p.id,
        purchaseType: p.purchaseType,
        usageRemaining: p.usageRemaining,
        totalUses: p.totalUses,
        purchasedAt: p.purchasedAt,
        lastUsedAt: p.lastUsedAt,
      },
    }));

    return NextResponse.json({ templates: items, total: items.length });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
