"use client";

/* ══════════════════════════════════════════════════════════════════════════
   PROMO FIELD  (EDITSv1 Phase E8 Task E8.4)
   ──────────────────────────────────────────────────────────────────────────
   Until this phase there was nowhere in the entire product to type a promo
   code. The admin could create them; a customer handed one had no field to
   put it in, and no route would have read it if they had.

   Every rejection gets its own sentence, straight from the server's reason
   code (src/lib/promos.js REJECTION_MESSAGE) — "that code has expired" and
   "you've already used that code" are different problems with different
   answers, and collapsing them into "invalid code" is how a customer ends
   up emailing support.

   A credit-grant code is applied the moment it validates, so `onApplied`
   is told to refresh the balance. A discount code is only previewed here;
   the code string is handed to the parent, which sends it with the checkout
   request, where the price is recomputed and the discount is claimed for
   real.
   ══════════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { apiFetch } from "@/lib/client-fetch";

export default function PromoField({ amountCents = 0, onApplied }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const apply = async (e) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;

    setBusy(true);
    setResult(null);
    try {
      const res = await apiFetch("/api/promos/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed, amountCents }),
        retries: 0,
      });
      const data = await res.json();
      setResult(data);
      if (data?.valid) onApplied?.(data);
    } catch (err) {
      setResult({
        valid: false,
        message:
          err?.status === 401
            ? "Sign in first — a code has to attach to an account."
            : err?.message || "That code could not be checked. Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={apply} className="hs-field" style={{ maxWidth: 420 }} noValidate>
      <label className="hs-label" htmlFor="promo-code">Promo code</label>
      <div className="hs-row" style={{ gap: "var(--s-2)", alignItems: "flex-start" }}>
        <input
          id="promo-code"
          className="hs-input"
          value={code}
          onChange={(e) => { setCode(e.target.value); setResult(null); }}
          autoComplete="off"
          spellCheck={false}
          placeholder="WELCOME20"
          aria-describedby={result ? "promo-result" : undefined}
          aria-invalid={result && !result.valid ? "true" : undefined}
        />
        <button type="submit" className="hs-btn hs-btn--outline" disabled={busy || !code.trim()}>
          {busy && <span className="hs-spin" aria-hidden="true" />}
          Apply
        </button>
      </div>

      {result && (
        <p
          id="promo-result"
          className={result.valid ? "hs-hint" : "hs-error"}
          role="status"
          style={result.valid ? { color: "var(--signal)" } : undefined}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
