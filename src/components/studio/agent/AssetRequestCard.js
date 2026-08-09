"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IcCheck, IcUpload, useUpload } from "@/components/studio/kit";
import { apiFetch } from "@/lib/client-fetch";

/* ══════════════════════════════════════════════════════════════════════════
   ASSET REQUEST CARD — the agent asking for material
   ──────────────────────────────────────────────────────────────────────────
   The studio can generate anything except the things that already exist: a
   real face, a real product, a real logo, a real voice. This is where the
   user hands those over.

   Two ways to fill a slot, and PICKING AN EXISTING ONE COMES FIRST. A user
   who already has "Wael" on file must not be nudged into uploading the same
   photographs again — that makes a second identity built from the same face,
   and the two drift apart over a production. So the picker is shown above
   the dropzone whenever there is anything to pick.

   Nothing is filed until Send: a half-answered card can be abandoned without
   leaving a stray character behind.
   ══════════════════════════════════════════════════════════════════════════ */

const ACCEPT_ATTR = {
  image: "image/png,image/jpeg,image/webp",
  audio: "audio/mpeg,audio/wav",
  video: "video/mp4,video/webm",
};

const KIND_NOUN = {
  character: "person",
  product: "product",
  environment: "place",
  logo: "logo",
  voice: "voice sample",
  footage: "footage",
};

export default function AssetRequestCard({ request, answered, sessionId, projectId, onFiled, disabled = false }) {
  const { upload, busy: uploading } = useUpload();
  const [slots, setSlots] = useState({});
  const [existing, setExisting] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const assets = useMemo(() => request?.assets || [], [request]);
  const locked = !!answered || disabled || sending;

  /* The cast the user already has, so a slot can be filled by pointing at
     one. Failure here is not fatal — the card degrades to upload-only. */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch("/api/entities?limit=50");
        const data = await res.json();
        if (alive) setExisting(Array.isArray(data?.entities) ? data.entities : []);
      } catch { /* upload-only */ }
    })();
    return () => { alive = false; };
  }, []);

  const setSlot = useCallback((key, patch) => {
    setSlots((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } }));
  }, []);

  const attach = useCallback(async (slot, files) => {
    if (!files?.length || locked) return;
    setError("");
    const done = [];
    for (const file of Array.from(files).slice(0, slot.max)) {
      const up = await upload(file);
      if (up?.url) done.push(up);
    }
    if (!done.length) { setError("Those files could not be uploaded."); return; }
    setSlot(slot.key, {
      files: [...((slots[slot.key]?.files) || []), ...done].slice(0, slot.max),
      // Uploading is an explicit choice to make a NEW identity; it clears a
      // previously picked one rather than silently doing both.
      entityId: "",
    });
  }, [locked, upload, setSlot, slots]);

  const candidatesFor = useCallback((slot) => {
    if (slot.kind === "voice") return existing.filter((e) => e.kind === "character");
    if (!["character", "product", "environment"].includes(slot.kind)) return [];
    return existing.filter((e) => e.kind === slot.kind);
  }, [existing]);

  /* A slot is answered by a pick, an upload, OR a description — the last is
     how a character nobody has a photograph of still gets filed once and
     described identically in every shot. */
  const describable = (slot) => ["character", "product", "environment"].includes(slot.kind);
  const answerFor = useCallback((slot) => {
    const s = slots[slot.key] || {};
    const description = (s.description ?? slot.description ?? "").trim();
    return {
      entityId: s.entityId || "",
      files: s.files || [],
      description,
      filled: Boolean(s.entityId || s.files?.length || (describable(slot) && description)),
    };
  }, [slots]);

  const unmet = assets.filter((a) => a.min > 0 && !answerFor(a).filled);

  const send = async () => {
    if (locked || unmet.length) return;
    setSending(true);
    setError("");
    try {
      const items = assets.map((a) => {
        const s = slots[a.key] || {};
        const answer = answerFor(a);
        return {
          key: a.key,
          kind: a.kind,
          name: (s.name ?? a.name) || "",
          voiceFor: a.voiceFor || "",
          entityId: answer.entityId,
          description: describable(a) ? answer.description : "",
          urls: answer.files.map((f) => f.url),
        };
      }).filter((i) => i.entityId || i.urls.length || i.description);

      if (!items.length) { setError("Add a file, pick something you already have, or describe it."); return; }

      const res = await apiFetch("/api/agent/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, projectId, items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || "Those assets could not be filed.");
      onFiled?.(data);
    } catch (e) {
      setError(e?.message || "Those assets could not be filed.");
    } finally {
      setSending(false);
    }
  };

  if (!assets.length) return null;

  if (answered) {
    return (
      <section className="st-assets st-assets--done" aria-label="Assets you provided">
        <p className="st-question__answered">
          <IcCheck className="hs-icon-sm" aria-hidden="true" />
          Filed — {answered}
        </p>
      </section>
    );
  }

  return (
    <section className="st-assets" aria-label="The agent needs these">
      {request.intro && <p className="st-assets__intro">{request.intro}</p>}

      <ul className="st-assets__list">
        {assets.map((slot) => {
          const s = slots[slot.key] || {};
          const options = candidatesFor(slot);
          const optional = slot.min <= 0;
          return (
            <li key={slot.key} className="st-assets__slot">
              <div className="st-assets__head">
                <strong>{slot.label}</strong>
                {optional && <span className="st-assets__opt">optional</span>}
              </div>
              {slot.hint && <p className="st-assets__hint">{slot.hint}</p>}

              {options.length > 0 && (
                <label className="st-assets__pick">
                  <span className="hs-sr">
                    {slot.kind === "voice"
                      ? `Who does this voice belong to?`
                      : `Use a ${KIND_NOUN[slot.kind]} you already have`}
                  </span>
                  <select
                    className="hs-input"
                    value={s.entityId || ""}
                    disabled={locked}
                    onChange={(e) => setSlot(slot.key, {
                      entityId: e.target.value,
                      // Picking is exclusive with uploading for identity
                      // slots; for a voice the pick is the OWNER, so the
                      // files stay.
                      ...(slot.kind === "voice" ? {} : { files: [] }),
                    })}
                  >
                    <option value="">
                      {slot.kind === "voice" ? "Whose voice is this?" : `Use one I already have…`}
                    </option>
                    {options.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                        {slot.kind !== "voice" && !((e.references || []).some((r) => r?.kind !== "voice")) ? " (no photos yet)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {(slot.kind !== "voice" ? !s.entityId : true) && (
                <div className="st-assets__drop">
                  <label className="hs-btn hs-btn--ghost hs-btn--sm">
                    <IcUpload className="hs-icon-sm" aria-hidden="true" />
                    {uploading ? "Uploading…" : s.files?.length ? "Add more" : `Upload ${KIND_NOUN[slot.kind]}`}
                    <input
                      type="file"
                      hidden
                      multiple={slot.max > 1}
                      accept={ACCEPT_ATTR[slot.accept] || undefined}
                      disabled={locked || uploading}
                      onChange={(e) => { attach(slot, e.target.files); e.target.value = ""; }}
                    />
                  </label>
                  {s.files?.length > 0 && (
                    <span className="st-assets__count">
                      {s.files.length} file{s.files.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              )}

              {describable(slot) && !s.entityId && (
                <label className="st-assets__name">
                  <span className="hs-sr">Name for this {KIND_NOUN[slot.kind]}</span>
                  <input
                    className="hs-input"
                    value={s.name ?? slot.name ?? ""}
                    disabled={locked}
                    placeholder={`Name this ${KIND_NOUN[slot.kind]}`}
                    onChange={(e) => setSlot(slot.key, { name: e.target.value })}
                  />
                </label>
              )}

              {/* No photograph is still an answer. These words become the
                  identity's description, and the SAME words then describe
                  them in every shot — which is the only thing that keeps an
                  invented character from being re-invented each cut. */}
              {describable(slot) && !s.entityId && (
                <label className="st-assets__describe">
                  <span className="st-assets__describe-label">
                    {s.files?.length ? "Anything else about them" : "…or just describe them"}
                  </span>
                  <textarea
                    className="hs-input"
                    rows={2}
                    value={s.description ?? slot.description ?? ""}
                    disabled={locked}
                    placeholder={`Build, age, hair, wardrobe, bearing — the same words will describe this ${KIND_NOUN[slot.kind]} in every shot`}
                    onChange={(e) => setSlot(slot.key, { description: e.target.value })}
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="hs-error" role="alert">{error}</p>}

      <div className="st-assets__actions">
        <button
          type="button"
          className="hs-btn hs-btn--primary hs-btn--sm"
          onClick={send}
          disabled={locked || unmet.length > 0}
        >
          {sending ? "Filing…" : "Send these"}
        </button>
        {unmet.length > 0 ? (
          <span className="st-assets__pending">
            Still needed: {unmet.map((a) => a.label).join(", ")}
          </span>
        ) : (
          <span className="st-assets__pending">
            Anything described but not uploaded is invented by the video model — consistently, but invented.
          </span>
        )}
      </div>
    </section>
  );
}
