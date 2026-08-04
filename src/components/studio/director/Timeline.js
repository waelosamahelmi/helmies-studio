"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sheet, Segmented, Dropzone,
  IcChevronLeft, IcChevronRight, IcScissors, IcSwap, IcRefresh, IcTrash, IcBolt,
} from "@/components/studio/kit";
import { apiFetch } from "@/lib/client-fetch";

/* ══════════════════════════════════════════════════════════════════════════
   TIMELINE — E4.4
   ──────────────────────────────────────────────────────────────────────────
   After a run completes, the film becomes an editable clip list: drag (or
   move-button) rearrange, per-clip trim (numeric + slider), split, replace
   (upload or an earlier generation), regenerate, remove, and per-boundary
   transitions. Nothing here re-renders shots — "Re-assemble" posts the clip
   list to /api/assemble and every assembly is a FRESH output; originals are
   never touched. The chat row translates an instruction into validated ops
   via /api/director/timeline-chat and applies them locally — it never
   assembles on its own.
   ══════════════════════════════════════════════════════════════════════════ */

const TRANSITIONS = [
  { value: "cut", label: "Cut" },
  { value: "fade", label: "Fade" },
  { value: "dissolve", label: "Dissolve" },
];

const round1 = (n) => Math.round(n * 10) / 10;

export default function Timeline({ pipelineId, clips, onAssembled, onRegenerate, regenerating }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [assembled, setAssembled] = useState(null);
  const [chat, setChat] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [replaceKey, setReplaceKey] = useState(null);
  const [recentVideos, setRecentVideos] = useState([]);

  const seededFor = useRef(null);
  const dragIndex = useRef(null);
  const keySeq = useRef(0);
  const nextKey = () => `tl${++keySeq.current}`;

  /* Seed once per pipeline; afterwards only merge regenerated shot urls so
     local edits (trims, order, replacements) survive refreshes. */
  useEffect(() => {
    if (seededFor.current !== pipelineId) {
      seededFor.current = pipelineId;
      setItems(clips.map((c) => ({
        key: nextKey(),
        shotId: c.shotId,
        title: c.title,
        url: c.url,
        durationSec: c.durationSec ?? null,
        inSec: null,
        outSec: null,
        transition: c.transition || "cut",
        replaced: false,
      })));
      setAssembled(null);
      return;
    }
    setItems((prev) => prev.map((it) => {
      if (it.replaced || !it.shotId) return it;
      const src = clips.find((c) => c.shotId === it.shotId);
      return src && src.url && src.url !== it.url ? { ...it, url: src.url } : it;
    }));
  }, [clips, pipelineId]);

  const move = useCallback((from, to) => {
    setItems((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length || from === to) return prev;
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  }, []);

  const patch = useCallback((key, p) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...p } : it)));
  }, []);

  const remove = useCallback((key) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }, []);

  const split = useCallback((key) => {
    setItems((prev) => {
      const at = prev.findIndex((it) => it.key === key);
      if (at < 0) return prev;
      const it = prev[at];
      const start = it.inSec ?? 0;
      const end = it.outSec ?? it.durationSec;
      if (end == null || end - start < 0.4) return prev;
      const mid = round1(start + (end - start) / 2);
      const a = { ...it, key: nextKey(), outSec: mid };
      const b = { ...it, key: nextKey(), inSec: mid, outSec: end, transition: it.transition };
      a.transition = "cut";
      return [...prev.slice(0, at), a, b, ...prev.slice(at + 1)];
    });
  }, []);

  /* Ops from timeline-chat — already validated server-side; guarded again. */
  const applyOps = useCallback((ops) => {
    setItems((prev) => {
      let next = [...prev];
      for (const op of ops) {
        if (op.op === "remove" && op.index >= 0 && op.index < next.length && next.length > 1) {
          next.splice(op.index, 1);
        } else if (op.op === "reorder" && op.from >= 0 && op.from < next.length && op.to >= 0 && op.to < next.length) {
          const [m] = next.splice(op.from, 1);
          next.splice(op.to, 0, m);
        } else if (op.op === "trim" && op.index >= 0 && op.index < next.length) {
          next[op.index] = {
            ...next[op.index],
            ...(op.inSec != null ? { inSec: Number(op.inSec) } : {}),
            ...(op.outSec != null ? { outSec: Number(op.outSec) } : {}),
          };
        } else if (op.op === "split" && op.index >= 0 && op.index < next.length) {
          const it = next[op.index];
          const start = it.inSec ?? 0;
          const end = it.outSec ?? it.durationSec;
          const mid = start + Number(op.atSec);
          if (end != null && mid > start && mid < end) {
            const a = { ...it, key: nextKey(), outSec: round1(mid), transition: "cut" };
            const b = { ...it, key: nextKey(), inSec: round1(mid), outSec: end };
            next = [...next.slice(0, op.index), a, b, ...next.slice(op.index + 1)];
          }
        }
      }
      return next;
    });
  }, []);

  const sendChat = useCallback(async () => {
    const instruction = chat.trim();
    if (!instruction || !pipelineId) return;
    setChatBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/director/timeline-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineId, instruction }),
        timeout: 60000,
        retries: 0,
      });
      const data = await res.json();
      if (Array.isArray(data?.ops)) applyOps(data.ops);
      setChat("");
    } catch (e) {
      setError(e?.message || "That instruction couldn't be applied.");
    } finally {
      setChatBusy(false);
    }
  }, [chat, pipelineId, applyOps]);

  const reassemble = useCallback(async () => {
    if (!items.length) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clips: items.map(({ url, inSec, outSec }) => ({
            url,
            ...(inSec != null && inSec > 0 ? { inSec } : {}),
            ...(outSec != null ? { outSec } : {}),
          })),
          transitions: items.slice(0, -1).map((it) => it.transition || "cut"),
          transitionDuration: 0.5,
        }),
        timeout: 600000,
        retries: 0,
      });
      const data = await res.json();
      if (data?.url) {
        setAssembled(data.url);
        onAssembled?.(data.url);
      }
    } catch (e) {
      setError(e?.message || "The film could not be assembled.");
    } finally {
      setBusy(false);
    }
  }, [items, onAssembled]);

  /* Replace sheet: upload a video or pick an earlier completed generation. */
  const openReplace = useCallback(async (key) => {
    setReplaceKey(key);
    try {
      const res = await apiFetch("/api/generations?tool=video&status=completed&limit=12");
      const data = await res.json();
      setRecentVideos((data?.generations || []).filter((g) => g.outputUrl));
    } catch { setRecentVideos([]); }
  }, []);

  const replaceWith = useCallback((url) => {
    if (!replaceKey || !url) return;
    patch(replaceKey, { url, inSec: null, outSec: null, replaced: true });
    setReplaceKey(null);
  }, [replaceKey, patch]);

  const trimField = (it, i, field, label) => {
    const value = it[field];
    const max = it.durationSec ?? 600;
    return (
      <label className="st-clip__trim">
        <span>{label}</span>
        <input
          type="number"
          className="hs-input"
          min={0}
          max={max}
          step={0.1}
          value={value ?? ""}
          placeholder={field === "inSec" ? "0" : it.durationSec != null ? String(it.durationSec) : "end"}
          aria-label={`Clip ${i + 1} ${field === "inSec" ? "in" : "out"} point in seconds`}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            patch(it.key, { [field]: v != null && Number.isFinite(v) ? v : null });
          }}
        />
        {it.durationSec != null && (
          <input
            type="range"
            min={0}
            max={it.durationSec}
            step={0.1}
            value={value ?? (field === "inSec" ? 0 : it.durationSec)}
            aria-label={`Drag clip ${i + 1} ${field === "inSec" ? "in" : "out"} point`}
            onChange={(e) => patch(it.key, { [field]: Number(e.target.value) })}
          />
        )}
      </label>
    );
  };

  if (!items.length) return null;

  return (
    <section className="st-timeline" aria-label="Timeline">
      <header className="st-timeline__head">
        <strong>Timeline</strong>
        <span className="hs-hint">{items.length} clip{items.length === 1 ? "" : "s"} — rearrange, trim, then re-assemble. Every assembly is a fresh cut; your originals stay.</span>
        <button
          type="button"
          className="hs-btn hs-btn--primary hs-btn--sm"
          style={{ marginLeft: "auto" }}
          onClick={reassemble}
          disabled={busy}
        >
          {busy ? <span className="hs-spin" /> : <IcBolt className="hs-icon-sm" />}
          Re-assemble
        </button>
      </header>

      {error && <p className="hs-notice hs-notice--fault" role="alert">{error}</p>}

      <ol className="st-timeline__list">
        {items.map((it, i) => (
          <li
            key={it.key}
            className="st-clip"
            draggable
            onDragStart={(e) => { dragIndex.current = i; e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragIndex.current;
              dragIndex.current = null;
              if (from != null && from !== i) move(from, i);
            }}
          >
            <span className="st-clip__no">{String(i + 1).padStart(2, "0")}</span>
            <video className="st-clip__thumb" src={it.url} muted playsInline preload="metadata" />

            <div className="st-clip__body">
              <strong className="st-clip__title">{it.title}</strong>
              <div className="st-clip__trims">
                {trimField(it, i, "inSec", "In")}
                {trimField(it, i, "outSec", "Out")}
              </div>
              {i < items.length - 1 && (
                <Segmented
                  options={TRANSITIONS}
                  value={it.transition || "cut"}
                  onChange={(v) => patch(it.key, { transition: v })}
                  label={`Transition after clip ${i + 1}`}
                />
              )}
            </div>

            <div className="st-clip__actions">
              <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip" data-tip="Move earlier"
                aria-label={`Move clip ${i + 1} earlier`} onClick={() => move(i, i - 1)} disabled={i === 0}>
                <IcChevronLeft className="hs-icon-sm" />
              </button>
              <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip" data-tip="Move later"
                aria-label={`Move clip ${i + 1} later`} onClick={() => move(i, i + 1)} disabled={i === items.length - 1}>
                <IcChevronRight className="hs-icon-sm" />
              </button>
              <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip" data-tip="Split in half"
                aria-label={`Split clip ${i + 1}`} onClick={() => split(it.key)}
                disabled={it.durationSec == null && it.outSec == null}>
                <IcScissors className="hs-icon-sm" />
              </button>
              <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip" data-tip="Replace this clip"
                aria-label={`Replace clip ${i + 1}`} onClick={() => openReplace(it.key)}>
                <IcSwap className="hs-icon-sm" />
              </button>
              {it.shotId && onRegenerate && (
                <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip" data-tip="Regenerate this clip"
                  aria-label={`Regenerate clip ${i + 1}`} onClick={() => onRegenerate(it.shotId)}
                  disabled={!!regenerating}>
                  {regenerating === `${it.shotId}:video` ? <span className="hs-spin" /> : <IcRefresh className="hs-icon-sm" />}
                </button>
              )}
              <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip" data-tip="Remove from the cut"
                aria-label={`Remove clip ${i + 1}`} onClick={() => remove(it.key)} disabled={items.length === 1}>
                <IcTrash className="hs-icon-sm" />
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div className="st-timeline__chat">
        <input
          className="hs-input"
          value={chat}
          onChange={(e) => setChat(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !chatBusy) { e.preventDefault(); sendChat(); } }}
          placeholder='Tell the editor what to change — "trim the first clip to 3 seconds", "remove the last clip"'
          aria-label="Timeline instruction"
          disabled={chatBusy}
        />
        <button type="button" className="hs-btn hs-btn--sm" onClick={sendChat} disabled={chatBusy || !chat.trim()}>
          {chatBusy ? <span className="hs-spin" /> : null}
          Apply
        </button>
      </div>

      {assembled && (
        <div className="st-timeline__result">
          <video src={assembled} controls playsInline data-testid="assembled-result" />
        </div>
      )}

      <Sheet open={!!replaceKey} onClose={() => setReplaceKey(null)} title="Replace clip">
        <div className="hs-stack">
          <Dropzone
            accept="video/*"
            label="Upload a replacement clip"
            value={null}
            onChange={(f) => f?.url && replaceWith(f.url)}
          />
          {recentVideos.length > 0 && (
            <div className="hs-stack" style={{ gap: "var(--s-2)" }}>
              <span className="hs-hint">Or pick an earlier generation</span>
              {recentVideos.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="hs-btn hs-btn--sm hs-btn--block"
                  onClick={() => replaceWith(g.outputUrl)}
                  style={{ justifyContent: "flex-start", overflow: "hidden" }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.prompt?.slice(0, 64) || g.model || g.id}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Sheet>
    </section>
  );
}
