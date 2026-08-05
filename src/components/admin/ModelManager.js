"use client";

/* ══════════════════════════════════════════════════════════════════════════
   ADMIN — MODELS
   ──────────────────────────────────────────────────────────────────────────
   /api/admin/models joins the static catalog in lib/models with whatever
   ModelPricing rows exist, and reports `configured: false` for models that
   have never been priced. A model with no row still runs — it just falls
   back to the estimator — so "not configured" is a state, not an error.

   Writes: POST upserts the pricing row, DELETE drops the override.
   Catalog syncs are bulk writes, so they are confirmed.
   ══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import { Confirm, Modal } from "@/components/studio/kit/Sheet";
import {
  Empty, Fault, Panel, Reload, Rows, Stats, Table,
  asArray, eur, num, send, useResource,
} from "./AdminPanel";
import { IcDownload, IcSearch, IcTrash } from "@/components/studio/kit/Icons";

export default function ModelManager() {
  const { data, loading, error, reload } = useResource("/api/admin/models");
  const models = asArray(data?.models);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [onlyConfigured, setOnlyConfigured] = useState(false);

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ creditsCost: "", providerCost: "", isActive: true });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState("");

  const [resetting, setResetting] = useState(null);
  const [syncing, setSyncing] = useState(null);   // "catalog" | "kie"
  const [syncAsk, setSyncAsk] = useState(null);
  const [syncNote, setSyncNote] = useState("");

  // EDITSv1 M3 — inputSchema editing.
  const [schemaModel, setSchemaModel] = useState(null);
  const [schemaText, setSchemaText] = useState("");
  const [schemaBusy, setSchemaBusy] = useState(false);
  const [schemaFault, setSchemaFault] = useState("");

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(models.map((m) => m.category))).sort()],
    [models],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      if (category !== "all" && m.category !== category) return false;
      if (onlyConfigured && !m.configured) return false;
      if (!q) return true;
      return (
        (m.name || "").toLowerCase().includes(q) ||
        (m.id || "").toLowerCase().includes(q) ||
        (m.provider || "").toLowerCase().includes(q)
      );
    });
  }, [models, query, category, onlyConfigured]);

  const configured = models.filter((m) => m.configured).length;
  const disabled = models.filter((m) => !m.isActive).length;

  const openEdit = (m) => {
    setEditing(m);
    setForm({
      creditsCost: m.creditsCost != null ? String(m.creditsCost) : "",
      providerCost: m.providerCost != null ? String(m.providerCost) : "",
      isActive: m.isActive !== false,
    });
    setErrs({});
    setFault("");
  };

  const write = async (model, patch) => {
    setFault("");
    await send("/api/admin/models", "POST", {
      modelId: model.id,
      modelType: model.category,
      providerName: model.provider,
      ...patch,
    });
  };

  const toggle = async (m) => {
    try {
      await write(m, { isActive: !m.isActive });
      reload();
    } catch (e) {
      setFault(e.message);
    }
  };

  const save = async () => {
    const next = {};
    const credits = Number(form.creditsCost);
    const cost = Number(form.providerCost);
    if (form.creditsCost === "" || !Number.isFinite(credits) || credits < 1) {
      next.creditsCost = "At least 1 credit. A free generation is still a bill from the provider.";
    }
    if (form.providerCost !== "" && (!Number.isFinite(cost) || cost < 0)) {
      next.providerCost = "Provider cost cannot be negative.";
    }
    setErrs(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await write(editing, {
        creditsCost: Math.round(credits),
        providerCost: form.providerCost === "" ? 0 : cost,
        isActive: form.isActive,
      });
      setEditing(null);
      reload();
    } catch (e) {
      setFault(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openSchema = (m) => {
    setSchemaModel(m);
    setSchemaText(JSON.stringify(m.inputSchema ?? { fields: {} }, null, 2));
    setSchemaFault("");
  };

  // Client-side JSON validation + a field-level preview, recomputed as the
  // admin types. The SERVER is still the gate (input-schema-validation.mjs)
  // — this only catches the obvious before a round-trip.
  const schemaPreview = useMemo(() => {
    if (!schemaModel) return { error: "", rows: [] };
    let parsed;
    try {
      parsed = JSON.parse(schemaText);
    } catch (e) {
      return { error: `Not valid JSON: ${e.message}`, rows: [] };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "Schema must be a JSON object.", rows: [] };
    }
    const fields = parsed.fields;
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      return { error: "Schema must carry a `fields` object.", rows: [] };
    }
    const rows = Object.entries(fields).map(([name, f]) => ({
      name,
      type: (f && typeof f === "object" && f.type) || "string",
      required: !!(f && typeof f === "object" && f.required === true),
      enum: f && typeof f === "object" && Array.isArray(f.enum) ? f.enum.join(", ") : "",
    }));
    return { error: "", rows, parsed };
  }, [schemaModel, schemaText]);

  const saveSchema = async () => {
    if (schemaPreview.error || !schemaPreview.parsed) return;
    setSchemaBusy(true);
    setSchemaFault("");
    try {
      await write(schemaModel, { inputSchema: schemaPreview.parsed });
      setSchemaModel(null);
      reload();
    } catch (e) {
      setSchemaFault(e.message);
    } finally {
      setSchemaBusy(false);
    }
  };

  const resetPricing = async (m) => {
    setFault("");
    try {
      await send("/api/admin/models", "DELETE", { modelId: m.id });
      reload();
    } catch (e) {
      setFault(e.message);
    }
  };

  const runSync = async (which) => {
    setSyncing(which);
    setSyncNote("");
    setFault("");
    try {
      const path = which === "kie" ? "/api/admin/sync/kie" : "/api/admin/sync/catalog";
      const json = await send(path, "POST");
      setSyncNote(
        json?.total != null
          ? `Synced ${num(json.total)} models.`
          : "Sync finished.",
      );
      reload();
    } catch (e) {
      setFault(e.message);
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Fault>{fault}</Fault>
      <Fault>{error}</Fault>

      <Panel
        title="Model catalog"
        badge={`${num(models.length)} models`}
        action={
          <>
            <button
              type="button"
              className="hs-btn hs-btn--sm"
              onClick={() => setSyncAsk("kie")}
              disabled={!!syncing}
            >
              {syncing === "kie" ? <span className="hs-spin" aria-hidden="true" /> : <IcDownload className="hs-icon-sm" />}
              Sync KIE
            </button>
            <button
              type="button"
              className="hs-btn hs-btn--sm"
              onClick={() => setSyncAsk("catalog")}
              disabled={!!syncing}
            >
              {syncing === "catalog" ? <span className="hs-spin" aria-hidden="true" /> : <IcDownload className="hs-icon-sm" />}
              Sync all providers
            </button>
            <Reload onClick={reload} />
          </>
        }
      >
        {syncNote && <p className="hs-notice hs-notice--signal" role="status">{syncNote}</p>}

        {loading ? <Rows n={2} h={92} /> : (
          <Stats
            items={[
              { label: "In catalog",  value: num(models.length) },
              { label: "Priced",      value: num(configured) },
              { label: "Unpriced",    value: num(models.length - configured), tone: models.length - configured ? "var(--caution)" : undefined },
              { label: "Switched off", value: num(disabled), tone: disabled ? "var(--fault)" : undefined },
            ]}
          />
        )}

        <div className="hs-field">
          <label className="hs-label" htmlFor="m-search">Find a model</label>
          <div style={{ position: "relative" }}>
            <IcSearch
              className="hs-icon-sm"
              style={{ position: "absolute", left: "var(--s-3)", top: "50%", transform: "translateY(-50%)", color: "var(--tx-mute)", pointerEvents: "none" }}
            />
            <input
              id="m-search"
              className="hs-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Model name, id or provider"
              autoComplete="off"
              style={{ paddingLeft: "var(--s-8)" }}
            />
          </div>
        </div>

        <div className="hs-chips" role="group" aria-label="Filter by category">
          {categories.map((c) => (
            <button key={c} type="button" className="hs-chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
          <button
            type="button"
            className="hs-chip"
            aria-pressed={onlyConfigured}
            onClick={() => setOnlyConfigured((v) => !v)}
          >
            priced only
          </button>
        </div>

        {loading ? <Rows /> : shown.length === 0 ? (
          <Empty icon={IcSearch} title="No model matches those filters">
            Widen the search or clear the category filter.
          </Empty>
        ) : (
          <Table
            caption="Model catalog and pricing"
            head={[
              "Model", "Provider", "Category",
              { key: "Credits", num: true },
              { key: "Cost", num: true },
              "On", {},
            ]}
          >
            {shown.map((m) => (
              <tr key={m.id}>
                <td>
                  <div style={{ color: "var(--tx)", fontWeight: 500 }}>{m.name}</div>
                  <div className="hs-mono hs-mute" style={{ fontSize: "var(--t-micro)" }}>{m.id}</div>
                </td>
                <td className="hs-mono">{m.provider}</td>
                <td><span className="hs-badge">{m.category}</span></td>
                <td className="hs-num">
                  {m.creditsCost != null ? num(m.creditsCost) : <span className="hs-mute">auto</span>}
                </td>
                <td className="hs-num">
                  {m.providerCost != null ? eur(m.providerCost) : <span className="hs-mute">—</span>}
                </td>
                <td>
                  <button
                    type="button"
                    className="hs-switch"
                    role="switch"
                    aria-checked={m.isActive !== false}
                    aria-label={`${m.name} — ${m.isActive !== false ? "available" : "hidden"}`}
                    onClick={() => toggle(m)}
                  />
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button type="button" className="hs-btn hs-btn--sm" onClick={() => openEdit(m)}>Price</button>
                  <button
                    type="button"
                    className="hs-btn hs-btn--sm"
                    style={{ marginLeft: "var(--s-2)" }}
                    onClick={() => openSchema(m)}
                    aria-label={`Edit schema for ${m.name}`}
                  >
                    Schema
                  </button>
                  {m.configured && (
                    <button
                      type="button"
                      className="hs-btn hs-btn--danger hs-btn--sm"
                      style={{ marginLeft: "var(--s-2)" }}
                      onClick={() => setResetting(m)}
                      aria-label={`Reset pricing for ${m.name}`}
                    >
                      <IcTrash className="hs-icon-sm" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Price ${editing.name}` : ""}
        footer={
          <>
            <button type="button" className="hs-btn hs-btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" className="hs-btn hs-btn--primary" onClick={save} disabled={busy}>
              {busy && <span className="hs-spin" aria-hidden="true" />}
              Save pricing
            </button>
          </>
        }
      >
        <Fault>{fault}</Fault>

        <div className="hs-field">
          <label className="hs-label" htmlFor="m-credits">Credits charged</label>
          <input
            id="m-credits"
            className="hs-input"
            type="number"
            min="1"
            step="1"
            value={form.creditsCost}
            onChange={(e) => { setForm({ ...form, creditsCost: e.target.value }); setErrs((p) => ({ ...p, creditsCost: "" })); }}
            aria-invalid={errs.creditsCost ? "true" : undefined}
            aria-describedby={errs.creditsCost ? "m-credits-error" : "m-credits-hint"}
          />
          {errs.creditsCost
            ? <p className="hs-error" id="m-credits-error">{errs.creditsCost}</p>
            : <p className="hs-hint" id="m-credits-hint">1 credit is worth <span className="hs-mono">€0.01</span> of retail value.</p>}
        </div>

        <div className="hs-field">
          <label className="hs-label" htmlFor="m-cost">Provider cost per run (€)</label>
          <input
            id="m-cost"
            className="hs-input"
            type="number"
            min="0"
            step="0.0001"
            value={form.providerCost}
            onChange={(e) => { setForm({ ...form, providerCost: e.target.value }); setErrs((p) => ({ ...p, providerCost: "" })); }}
            aria-invalid={errs.providerCost ? "true" : undefined}
            aria-describedby={errs.providerCost ? "m-cost-error" : "m-cost-hint"}
          />
          {errs.providerCost
            ? <p className="hs-error" id="m-cost-error">{errs.providerCost}</p>
            : <p className="hs-hint" id="m-cost-hint">
                What we pay upstream. Drives every margin figure on the overview.
              </p>}
        </div>

        <div className="pg-kv">
          <div>
            <div className="pg-kv__k">Available to users</div>
            <div className="pg-kv__sub">Off hides it from every picker.</div>
          </div>
          <button
            type="button"
            className="hs-switch"
            role="switch"
            aria-checked={form.isActive}
            aria-label="Available to users"
            onClick={() => setForm({ ...form, isActive: !form.isActive })}
          />
        </div>

        {editing && form.creditsCost !== "" && form.providerCost !== "" && (
          <p className="hs-notice">
            Margin at this price:{" "}
            <span className="hs-mono">
              {eur(Number(form.creditsCost) * 0.01 - Number(form.providerCost))}
            </span>{" "}
            per run.
          </p>
        )}
      </Modal>

      <Modal
        open={!!schemaModel}
        onClose={() => setSchemaModel(null)}
        title={schemaModel ? `Schema for ${schemaModel.name}` : ""}
        footer={
          <>
            <button type="button" className="hs-btn hs-btn--ghost" onClick={() => setSchemaModel(null)}>Cancel</button>
            <button
              type="button"
              className="hs-btn hs-btn--primary"
              onClick={saveSchema}
              disabled={schemaBusy || !!schemaPreview.error}
            >
              {schemaBusy && <span className="hs-spin" aria-hidden="true" />}
              Save schema
            </button>
          </>
        }
      >
        <Fault>{schemaFault}</Fault>

        <div className="hs-field">
          <label className="hs-label" htmlFor="m-schema">Input schema (JSON)</label>
          <textarea
            id="m-schema"
            className="hs-input hs-mono"
            rows={12}
            value={schemaText}
            onChange={(e) => setSchemaText(e.target.value)}
            spellCheck={false}
            aria-invalid={schemaPreview.error ? "true" : undefined}
            aria-describedby={schemaPreview.error ? "m-schema-error" : "m-schema-hint"}
            style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "var(--t-micro)", resize: "vertical" }}
          />
          {schemaPreview.error
            ? <p className="hs-error" id="m-schema-error">{schemaPreview.error}</p>
            : <p className="hs-hint" id="m-schema-hint">
                {"Shape: { \"fields\": { name: { type, required, enum, default, … } } }. Studio controls, submit validation and required-field defaults all read this."}
              </p>}
        </div>

        {!schemaPreview.error && (
          schemaPreview.rows.length === 0 ? (
            <p className="hs-hint">No fields declared yet.</p>
          ) : (
            <Table
              caption="Field preview"
              head={["Field", "Type", "Required", "Enum"]}
            >
              {schemaPreview.rows.map((f) => (
                <tr key={f.name}>
                  <td className="hs-mono">{f.name}</td>
                  <td>{f.type}</td>
                  <td>{f.required ? "yes" : "no"}</td>
                  <td className="hs-mono" style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{f.enum || "—"}</td>
                </tr>
              ))}
            </Table>
          )
        )}
      </Modal>

      <Confirm
        open={!!resetting}
        onClose={() => setResetting(null)}
        onConfirm={() => resetPricing(resetting)}
        title="Drop this pricing override?"
        body={
          resetting
            ? `${resetting.name} goes back to the estimator's fallback cost, and its provider cost stops feeding the margin reports.`
            : ""
        }
        confirmLabel="Drop override"
      />

      <Confirm
        open={!!syncAsk}
        onClose={() => setSyncAsk(null)}
        onConfirm={() => runSync(syncAsk)}
        title={syncAsk === "kie" ? "Sync the KIE catalog?" : "Sync every provider catalog?"}
        body="This overwrites synced model rows with what the provider reports right now, including names and pricing rules. Manual overrides on unmanaged models are left alone."
        confirmLabel="Run sync"
        danger={false}
      />
    </div>
  );
}
