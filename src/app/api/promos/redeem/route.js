import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse, AuthzError } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkAnonLimit } from "@/lib/rate-limit";
import { validatePromo, redeemPromo, discountFor } from "@/lib/promos";

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/promos/redeem  (EDITSv1 Phase E8 Task E8.4)
   ──────────────────────────────────────────────────────────────────────────
   The endpoint a customer's promo code had nowhere to go to. Two shapes of
   answer, because there are two shapes of code:

     · A CREDIT-GRANT code is redeemed here and now — credits land in the
       wallet through grantCredits (ledger row and all), with the
       PromoRedemption row and the currentUses increment in the same
       transaction, so a double-submitted form cannot grant twice.

     · A DISCOUNT code (percentage or fixed) is only PREVIEWED here. Nothing
       is recorded, because nothing has been used yet — the discount is
       claimed at checkout, where the price is recomputed server-side and
       both money guards are applied. This endpoint exists so the customer
       can see what they will pay BEFORE they are sent to a payment page.

   Rate-limited per user, not per IP: the threat is someone guessing at the
   code space, and a signed-in account is the axis that actually identifies
   them. Twenty attempts per ten minutes is invisible to a person typing a
   code off an email, and hopeless for a script.
   ══════════════════════════════════════════════════════════════════════════ */
const LIMIT = { windowMs: 10 * 60 * 1000, max: 20 };

export async function POST(req) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new AuthzError(401, "Unauthorized");
    verifyOrigin(req);

    const { allowed, retryAfter } = await checkAnonLimit(user.id, "/api/promos/redeem", LIMIT);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many code attempts. Wait a moment and try again.", retryAfter },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code : "";
    // amountCents lets the client ask "what would this cost me on THAT
    // pack" — it is only ever used to render a preview. Every real charge is
    // recomputed from the CreditPack row at checkout; nothing a client sends
    // here can change what they are billed.
    const amountCents = Number.isFinite(Number(body?.amountCents)) ? Number(body.amountCents) : 0;

    const check = await validatePromo(code, user.id);
    if (!check.valid) {
      // 200, not 4xx: "that code has expired" is a normal answer to a
      // normal question, and the client renders `message` as-is.
      return NextResponse.json({ valid: false, reason: check.reason, message: check.message });
    }

    const promo = check.promo;

    if (promo.type === "credits") {
      const result = await redeemPromo(code, user.id);
      if (!result.valid) {
        return NextResponse.json({ valid: false, reason: result.reason, message: result.message });
      }
      return NextResponse.json({
        valid: true,
        code: promo.code,
        type: "credits",
        granted: true,
        credits: result.credits,
        message: `${result.credits} credits added to your balance.`,
      });
    }

    const preview = discountFor(amountCents, promo);
    return NextResponse.json({
      valid: true,
      code: promo.code,
      type: promo.type,
      value: promo.value,
      granted: false,
      description: promo.description || null,
      discountCents: preview.discountCents,
      chargeCents: preview.chargeCents,
      message:
        promo.type === "percentage"
          ? `${promo.value}% off applied at checkout.`
          : `€${(promo.value / 100).toFixed(2)} off applied at checkout.`,
    });
  } catch (e) {
    return authzResponse(e);
  }
}
