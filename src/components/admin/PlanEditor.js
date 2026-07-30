"use client";

/* ══════════════════════════════════════════════════════════════════════════
   ADMIN — SUBSCRIPTION PLANS AND CREDIT PACKS
   ──────────────────────────────────────────────────────────────────────────
   /api/admin/plans and /api/admin/credit-packs expose GET and POST only.
   There is no PATCH and no DELETE, so this screen lists and creates — it
   does not pretend to edit. The fields match the Prisma models exactly
   (SubscriptionPlan: name, slug, price, credits, stripePriceId, features,
   sortOrder; CreditPack: name, credits, price, stripePriceId, sortOrder).

   What the checkout actually sells is still lib/plan-constants plus the
   STRIPE_PRICE_* environment variables. Rows created here are catalog data;
   they do not rewire Stripe on their own.
   ══════════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import {
  Empty, Fault, Note, Panel, Reload, Rows, Table,
  asArray, num, send, useResource,
} from "./AdminPanel";
import { IcArchive, IcPlus } from "@/components/studio/kit/Icons";

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function PlanEditor({ type = "plans" }) {
  const plans = type === "plans";
  const path = plans ? "/api/admin/plans" : "/api/admin/credit-packs";
  const title = plans ? "Subscription plans" : "Credit packs";

  const { data, loading, error, reload } = useResource(path);
  const items = asArray(data);

  const [form, setForm] = useState({
    name: "", slug: "", price: "", credits: "", stripePriceId: "", sortOrder: "0", features: "",
  });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState("");
  const [done, setDone] = useState("");

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrs((p) => ({ ...p, [key]: "" }));
  };

  const create = async (e) => {
    e.preventDefault();
    const next = {};
    if (!form.name.trim()) next.name = "Name it.";
    if (plans && !slugify(form.slug || form.name)) next.slug = "The slug cannot be empty.";

    const price = Number(form.price);
    if (form.price === "" || !Number.isFinite(price) || price < 0) next.price = "Whole euros, zero or more.";

    const credits = Number(form.credits);
    if (form.credits === "" || !Number.isFinite(credits) || credits < 1) next.credits = "At least 1 credit.";

    setErrs(next);
    setDone("");
    if (Object.keys(next).length) return;

    const payload = plans
      ? {
          name: form.name.trim(),
          slug: slugify(form.slug || form.name),
          price: Math.round(price),
          credits: Math.round(credits),
          stripePriceId: form.stripePriceId.trim() || null,
          sortOrder: Math.round(Number(form.sortOrder) || 0),
          features: form.features.split(",").map((f) => f.trim()).filter(Boolean),
        }
      : {
          name: form.name.trim(),
          credits: Math.round(credits),
          price: Math.round(price),
          stripePriceId: form.stripePriceId.trim() || null,
          sortOrder: Math.round(Number(form.sortOrder) || 0),
        };

    setBusy(true);
    setFault("");
    try {
      await send(path, "POST", payload);
      setForm({ name: "", slug: "", price: "", credits: "", stripePriceId: "", sortOrder: "0", features: "" });
      setDone(`${payload.name} created.`);
      reload();
    } catch (err) {
      setFault(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Fault>{fault}</Fault>

      <Panel title={title} badge={`${num(items.length)} rows`} action={<Reload onClick={reload} />}>
        <Fault>{error}</Fault>

        {loading ? <Rows /> : items.length === 0 ? (
          <Empty icon={IcArchive} title={plans ? "No plans in the database" : "No packs in the database"}>
            {plans
              ? "Checkout runs off plan-constants and the STRIPE_PRICE_* variables until you define rows here."
              : "Top-ups run off lib/credit-packs until you define rows here."}
          </Empty>
        ) : (
          <Table
            caption={title}
            head={
              plans
                ? ["Name", "Slug", { key: "€ / mo", num: true }, { key: "Credits", num: true }, "Stripe price", "Live"]
                : ["Name", { key: "Credits", num: true }, { key: "€", num: true }, "Stripe price", "Live"]
            }
          >
            {items.map((i) => (
              <tr key={i.id}>
                <td style={{ color: "var(--tx)", fontWeight: 500 }}>{i.name}</td>
                {plans && <td className="hs-mono">{i.slug}</td>}
                {plans ? <td className="hs-num">€{num(i.price)}</td> : <td className="hs-num">{num(i.credits)}</td>}
                {plans ? <td className="hs-num">{num(i.credits)}</td> : <td className="hs-num">€{num(i.price)}</td>}
                <td className="hs-mono">{i.stripePriceId || "—"}</td>
                <td>
                  <span className={`hs-badge ${i.isActive ? "hs-badge--signal" : ""}`}>
                    {i.isActive ? "Active" : "Off"}
                  </span>
                </td>
              </tr>
            ))}
          </Table>
        )}

        <Note>
          This list is read-only: the API has no PATCH or DELETE. To change a row, add its
          replacement and retire the old one in the database.
        </Note>
      </Panel>

      <Panel title={plans ? "New plan" : "New credit pack"}>
        {done && <p className="hs-notice hs-notice--signal" role="status">{done}</p>}

        <form onSubmit={create} noValidate>
          <div className="hs-field">
            <label className="hs-label" htmlFor="pe-name">Name</label>
            <input
              id="pe-name"
              className="hs-input"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoComplete="off"
              placeholder={plans ? "Studio" : "2500 credits"}
              aria-invalid={errs.name ? "true" : undefined}
              aria-describedby={errs.name ? "pe-name-error" : undefined}
            />
            {errs.name && <p className="hs-error" id="pe-name-error">{errs.name}</p>}
          </div>

          {plans && (
            <div className="hs-field">
              <label className="hs-label" htmlFor="pe-slug">Slug</label>
              <input
                id="pe-slug"
                className="hs-input hs-mono"
                value={form.slug}
                onChange={(e) => set("slug", e.target.value)}
                autoComplete="off"
                placeholder={slugify(form.name) || "studio"}
                aria-invalid={errs.slug ? "true" : undefined}
                aria-describedby={errs.slug ? "pe-slug-error" : "pe-slug-hint"}
              />
              {errs.slug
                ? <p className="hs-error" id="pe-slug-error">{errs.slug}</p>
                : <p className="hs-hint" id="pe-slug-hint">Left empty, it is derived from the name. Must be unique.</p>}
            </div>
          )}

          <div className="hs-field">
            <label className="hs-label" htmlFor="pe-price">Price in whole euros</label>
            <input
              id="pe-price"
              className="hs-input"
              type="number"
              min="0"
              step="1"
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
              aria-invalid={errs.price ? "true" : undefined}
              aria-describedby={errs.price ? "pe-price-error" : "pe-price-hint"}
            />
            {errs.price
              ? <p className="hs-error" id="pe-price-error">{errs.price}</p>
              : <p className="hs-hint" id="pe-price-hint">The column is an integer — cents are not stored.</p>}
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="pe-credits">
              {plans ? "Credits per month" : "Credits in the pack"}
            </label>
            <input
              id="pe-credits"
              className="hs-input"
              type="number"
              min="1"
              step="1"
              value={form.credits}
              onChange={(e) => set("credits", e.target.value)}
              aria-invalid={errs.credits ? "true" : undefined}
              aria-describedby={errs.credits ? "pe-credits-error" : undefined}
            />
            {errs.credits && <p className="hs-error" id="pe-credits-error">{errs.credits}</p>}
          </div>

          {plans && (
            <div className="hs-field">
              <label className="hs-label" htmlFor="pe-features">Features</label>
              <input
                id="pe-features"
                className="hs-input"
                value={form.features}
                onChange={(e) => set("features", e.target.value)}
                autoComplete="off"
                placeholder="4K downloads, Priority queue, Generation archive"
              />
              <p className="hs-hint">Comma separated. Stored as a JSON array.</p>
            </div>
          )}

          <div className="hs-field">
            <label className="hs-label" htmlFor="pe-stripe">Stripe price id <span className="hs-mute">(optional)</span></label>
            <input
              id="pe-stripe"
              className="hs-input hs-mono"
              value={form.stripePriceId}
              onChange={(e) => set("stripePriceId", e.target.value)}
              autoComplete="off"
              placeholder="price_…"
            />
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="pe-sort">Sort order</label>
            <input
              id="pe-sort"
              className="hs-input"
              type="number"
              step="1"
              value={form.sortOrder}
              onChange={(e) => set("sortOrder", e.target.value)}
            />
            <p className="hs-hint">Lower shows first.</p>
          </div>

          <button type="submit" className="hs-btn hs-btn--primary" style={{ marginTop: "var(--s-5)" }} disabled={busy}>
            {busy ? <span className="hs-spin" aria-hidden="true" /> : <IcPlus className="hs-icon-sm" />}
            Create {plans ? "plan" : "pack"}
          </button>
        </form>
      </Panel>
    </div>
  );
}
