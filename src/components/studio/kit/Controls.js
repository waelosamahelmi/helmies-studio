"use client";

import { useCallback, useId, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";
import { IcUpload, IcClose, IcPlus, IcMinus } from "./Icons";

/* ══════════════════════════════════════════════════════════════════════════
   CONTROLS — the parts every tool builds its panel from
   ══════════════════════════════════════════════════════════════════════════ */

export function Field({ label, hint, error, children, id }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <div className="hs-field">
      {label && <label className="hs-label" htmlFor={fid}>{label}</label>}
      {typeof children === "function" ? children(fid) : children}
      {error ? <span className="hs-error">{error}</span> : hint ? <span className="hs-hint">{hint}</span> : null}
    </div>
  );
}

export function Group({ label, children, right }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
      {(label || right) && (
        <div className="hs-row hs-row--between">
          {label && <span className="hs-label" style={{ margin: 0 }}>{label}</span>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/* ── Segmented — 2 to 4 mutually exclusive modes ───────────────────────── */
export function Segmented({ options = [], value, onChange, label }) {
  return (
    <div className="hs-segmented" role="group" aria-label={label}>
      {options.map((o) => {
        const val = o.value ?? o;
        const text = o.label ?? String(o);
        const on = String(value) === String(val);
        return (
          <button
            key={val}
            type="button"
            aria-pressed={on}
            className={on ? "is-active" : ""}
            onClick={() => onChange?.(val)}
            disabled={o.disabled}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

/* ── Chips — many discrete options; scrolls on narrow screens ──────────── */
export function Chips({ options = [], value, onChange, label, scroll = false, compare }) {
  const same = compare || ((a, b) => String(a) === String(b));
  return (
    <div className={`hs-chips${scroll ? " hs-chips--scroll" : ""}`} role="group" aria-label={label}>
      {options.map((o) => {
        const val = o.value ?? o;
        const text = o.label ?? String(o);
        const on = same(value, val);
        return (
          <button
            key={val}
            type="button"
            aria-pressed={on}
            className={`hs-chip${on ? " is-active" : ""}`}
            onClick={() => onChange?.(val)}
            disabled={o.disabled}
            title={o.title}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

/* ── Aspect ratio — shows the shape, because that is the actual decision ─ */
export function RatioPicker({ options = [], value, onChange }) {
  return (
    <div className="hs-chips" role="group" aria-label="Aspect ratio">
      {options.map((r) => {
        const [w, h] = String(r).split(":").map(Number);
        const on = String(value) === String(r);
        const scale = 13 / Math.max(w || 1, h || 1);
        return (
          <button
            key={r}
            type="button"
            aria-pressed={on}
            className={`hs-chip${on ? " is-active" : ""}`}
            onClick={() => onChange?.(r)}
          >
            <span
              aria-hidden="true"
              style={{
                width: Math.max(4, Math.round((w || 16) * scale)),
                height: Math.max(4, Math.round((h || 9) * scale)),
                border: "1px solid currentColor",
                borderRadius: 1.5,
                opacity: 0.85,
                flex: "none",
              }}
            />
            {r}
          </button>
        );
      })}
    </div>
  );
}

/* ── Toggle ────────────────────────────────────────────────────────────── */
export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", cursor: "pointer" }}>
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        className="hs-switch"
        onClick={() => onChange?.(!checked)}
      />
      <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: "var(--t-sm)" }}>{label}</span>
        {hint && <span className="hs-hint">{hint}</span>}
      </span>
    </label>
  );
}

/* ── Stepper — bounded numeric values (duration, count, steps) ─────────── */
export function Stepper({ value, onChange, min = 1, max = 10, step = 1, suffix = "", label }) {
  const set = (n) => onChange?.(Math.min(max, Math.max(min, n)));
  return (
    <div className="hs-row" role="group" aria-label={label} style={{ gap: "var(--s-2)" }}>
      <button
        type="button"
        className="hs-btn hs-btn--sm hs-btn--icon"
        onClick={() => set(Number(value) - step)}
        disabled={Number(value) <= min}
        aria-label="Decrease"
      >
        <IcMinus className="hs-icon-sm" />
      </button>
      <output
        className="hs-mono"
        style={{
          flex: 1, textAlign: "center", fontSize: "var(--t-sm)",
          fontWeight: 600, color: "var(--tx)",
        }}
      >
        {value}{suffix}
      </output>
      <button
        type="button"
        className="hs-btn hs-btn--sm hs-btn--icon"
        onClick={() => set(Number(value) + step)}
        disabled={Number(value) >= max}
        aria-label="Increase"
      >
        <IcPlus className="hs-icon-sm" />
      </button>
    </div>
  );
}

/* ── Slider with a live mono readout ───────────────────────────────────── */
export function Slider({ value, onChange, min = 0, max = 1, step = 0.05, label, format }) {
  const id = useId();
  return (
    <div className="hs-field">
      <div className="hs-row hs-row--between">
        <label className="hs-label" htmlFor={id} style={{ margin: 0 }}>{label}</label>
        <output className="hs-mono" style={{ fontSize: 11, color: "var(--tx-dim)" }}>
          {format ? format(value) : value}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="hs-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange?.(Number(e.target.value))}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   UPLOAD — one place that talks to /api/upload
   ══════════════════════════════════════════════════════════════════════════ */
export function useUpload() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = useCallback(async (file) => {
    if (!file) return null;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await apiFetch("/api/upload", { method: "POST", body, timeout: 120000, retries: 0 });
      const data = await res.json();
      if (!data?.url) throw new Error(data?.error || "Upload did not return a URL");
      return { url: data.url, name: file.name, type: file.type, size: file.size };
    } catch (e) {
      setError(e?.message || "Upload failed");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { upload, busy, error, setError };
}

/**
 * Drop target + file picker. Accepts one file or many.
 * Renders its own thumbnails so tools don't each reinvent them.
 */
export function Dropzone({
  value,                 // {url,name} | array | null
  onChange,
  accept = "image/*",
  multiple = false,
  max = 4,
  label = "Drop a file or click to browse",
  hint,
}) {
  const input = useRef(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const { upload, busy, error } = useUpload();

  const list = multiple ? (Array.isArray(value) ? value : []) : value ? [value] : [];

  const take = async (files) => {
    const picked = Array.from(files || []).slice(0, multiple ? max - list.length : 1);
    if (!picked.length) return;
    const done = [];
    for (const f of picked) {
      const r = await upload(f);
      if (r) done.push(r);
    }
    if (!done.length) return;
    onChange?.(multiple ? [...list, ...done].slice(0, max) : done[0]);
  };

  const remove = (i) => {
    if (!multiple) return onChange?.(null);
    onChange?.(list.filter((_, n) => n !== i));
  };

  const dragProps = {
    onDragEnter: (e) => {
      e.preventDefault(); e.stopPropagation();
      depth.current++;
      if (e.dataTransfer?.types?.includes("Files")) setOver(true);
    },
    onDragLeave: (e) => {
      e.preventDefault(); e.stopPropagation();
      depth.current--;
      if (depth.current <= 0) { depth.current = 0; setOver(false); }
    },
    onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); },
    onDrop: (e) => {
      e.preventDefault(); e.stopPropagation();
      depth.current = 0; setOver(false);
      take(e.dataTransfer?.files);
    },
  };

  const full = multiple ? list.length >= max : list.length >= 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
      {list.length > 0 && (
        <div className="hs-thumbs">
          {list.map((f, i) => (
            <div key={f.url + i} className="hs-thumb">
              {/\.(mp4|webm|mov)(\?|$)/i.test(f.url)
                ? <video src={f.url} muted playsInline />
                : <img src={f.url} alt={f.name || "Reference"} />}
              <button
                type="button"
                className="hs-thumb__x"
                onClick={() => remove(i)}
                aria-label={`Remove ${f.name || "reference"}`}
              >
                <IcClose style={{ width: 11, height: 11 }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!full && (
        <button
          type="button"
          className={`hs-drop${over ? " is-over" : ""}`}
          onClick={() => input.current?.click()}
          disabled={busy}
          {...dragProps}
        >
          {busy ? <span className="hs-spin" /> : <IcUpload />}
          <span>{busy ? "Uploading…" : label}</span>
          {hint && <span style={{ fontSize: 10, color: "var(--tx-ghost)" }}>{hint}</span>}
        </button>
      )}

      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => { take(e.target.files); e.target.value = ""; }}
      />

      {error && <span className="hs-error">{error}</span>}
    </div>
  );
}

/* ── Read-only spec list — the inspector's main content ────────────────── */
export function Specs({ rows = [] }) {
  const shown = rows.filter((r) => r && r.v != null && r.v !== "");
  if (!shown.length) return null;
  return (
    <dl className="st-specs">
      {shown.map(({ k, v }) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
