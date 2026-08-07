"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brief, ModelPicker, Sheet, Fault,
  Field, Group, Chips, Slider, Dropzone, Specs,
  clock, mediaUrl,
  IcMic, IcSettings, IcDownload, IcExternal, IcRefresh,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { useStudioMode } from "./useStudioMode";
import ModeBar from "./ModeBar";
import AudioToolsStudio from "./AudioToolsStudio";
import VoiceCloneWizard from "./VoiceCloneWizard";
import { matchesGroup } from "@/lib/capability-groups";
import { audioKind } from "@/lib/model-catalog-core.mjs";
import { apiFetch } from "@/lib/client-fetch";
import { placeholderPeaks, useWaveform, useTransport, Waveform, Transport } from "@/components/studio/kit/Waveform";

/* ══════════════════════════════════════════════════════════════════════════
   AUDIO — speech, dialogue, voice cloning and sound effects (.st-wave)
   ──────────────────────────────────────────────────────────────────────────
   Music lives in its own tool, and the clean/convert utilities live in
   Audio Tools. This one covers the four jobs where the source of truth is a
   voice or an effect.

   Fixed in the EDITSv1 rework:
   · The pool split on `m.provider` — a field the public catalog NEVER emits
     for non-admins — so the old "exclude Suno" branch was dead code and the
     Sound segment showed composers, converters and cloners alike. Pools now
     go through audioKind (model-catalog-core.mjs): tts / dialogue /
     voice-clone / sfx, each segment listing only its own kind.
   · Errors render through the kit's Stage error path (Fault) instead of a
     bespoke banner, so this surface inherits every ErrorPanel upgrade.
   · Controls stay gated on the model's own input schema — the only
     capability signal the catalog emits — and E1.2's curated schemas mean
     the ElevenLabs voice/stability/similarity/speed controls now genuinely
     render for the models that accept them.
   ══════════════════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════════════════════
   Catalog capability reading
   ──────────────────────────────────────────────────────────────────────────
   `serializeCatalogModel` emits `schema` (the model's own input schema) and
   useModelCatalog derives `durations` / `resolutions` / `maxImages` from it.
   Those are the only capability signals that exist at runtime. A model with
   no schema tells us nothing, so we show the control rather than hide it —
   the provider ignores a field it does not take.
   ══════════════════════════════════════════════════════════════════════════ */
function offers(model, ...fields) {
  const declared = model?.schema?.fields;
  if (!declared) return true;
  return fields.some((f) => !!declared[f]);
}

const VOICES = [
  { id: "rachel", label: "Rachel", desc: "Warm, unhurried, mid-range" },
  { id: "domi", label: "Domi", desc: "Steady and even, low affect" },
  { id: "bella", label: "Bella", desc: "Bright, expressive, quick" },
  { id: "elli", label: "Elli", desc: "Young, light, conversational" },
  { id: "antoni", label: "Antoni", desc: "Deep, measured, assured" },
  { id: "josh", label: "Josh", desc: "Open, friendly, everyday" },
  { id: "arnold", label: "Arnold", desc: "Hard consonants, commanding" },
  { id: "sam", label: "Sam", desc: "Neutral, unaccented, clean" },
];

/* Four jobs, one archetype. `kind` is the audioKind value the segment pools
   on; everything else is copy. */
const MODES = {
  speech: {
    label: "Speech",
    kind: "tts",
    pickerLabel: "Voice model",
    empty: "No text-to-speech models in the catalog yet.",
    eyebrow: "Speech",
    submitLabel: "Speak",
    maxChars: 5000,
    placeholder: "Write the script exactly as it should be read.",
    emptyTitle: "Write the line to be spoken",
    emptyBody: "Punctuation is direction: commas breathe, full stops land. Pick a voice on the left, then write the script below.",
    examples: [
      "Welcome back. Let's pick up where we left off.",
      "In 1911, the harbour froze for the first time in a century.",
      "Three things changed this quarter, and only one of them mattered.",
      "Press and hold to record. Release to send.",
    ],
  },
  dialogue: {
    label: "Dialogue",
    kind: "dialogue",
    pickerLabel: "Dialogue model",
    empty: "No dialogue models in the catalog yet.",
    eyebrow: "Dialogue",
    submitLabel: "Perform",
    maxChars: 5000,
    placeholder: "Write the exchange, one speaker per line: Anna: … / Ben: …",
    emptyTitle: "Write the exchange",
    emptyBody: "Name the speakers and write their lines — the model performs the scene, pauses and interruptions included.",
    examples: [
      "Anna: You're late. Ben: The bridge was up. Anna: The bridge is never up.",
      "Host: Three minutes left. Guest: Then I'll talk fast.",
      "Child: Is it far? Guide: Only until the light changes.",
    ],
  },
  voice: {
    label: "Voice cloning",
    kind: "voice-clone",
    pickerLabel: "Cloning model",
    empty: "No voice cloning models in the catalog yet.",
    eyebrow: "Voice cloning",
    submitLabel: "Build voice",
    maxChars: 2000,
    placeholder: "Describe the voice to build — age, register, pace, mood.",
    emptyTitle: "Describe the voice",
    emptyBody: "Describe the voice you need, or attach a reference track for the model to learn from.",
    examples: [
      "Low, unhurried narrator, slight rasp, documentary calm",
      "Bright announcer, quick pace, always on the edge of a smile",
      "Soft-spoken guide, mid-register, long patient phrases",
    ],
  },
  sfx: {
    label: "Sound effects",
    kind: "sfx",
    pickerLabel: "Sound model",
    empty: "No sound effect models in the catalog yet.",
    eyebrow: "Sound effects",
    submitLabel: "Render",
    maxChars: 600,
    placeholder: "Describe the sound: the object, the space, the tail.",
    emptyTitle: "Describe the sound",
    emptyBody: "Name the object, the space and the tail. \"Door closing in a stone corridor\" beats \"nice door sound\".",
    examples: [
      "Heavy wooden door closing in a stone corridor, long tail",
      "Rain on a car roof, distant traffic, no music",
      "Single metallic impact, tuned low, short decay",
      "Crowd murmur in a large hall, indistinct speech",
    ],
  },
};

function AudioGenBody({ mode, initialModel, templateConfig, onCreditsChanged }) {
  const [modelId, setModelId] = useState(initialModel || null);
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("");
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);
  const [speed, setSpeed] = useState(1);
  const [duration, setDuration] = useState(null);
  const [source, setSource] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [profiles, setProfiles] = useState([]);

  const { models, loading: loadingModels } = useModelCatalog({});

  /* S2 — the user's ready VoiceProfiles list alongside the stock voices in
     the Speech picker. A fetch failure just leaves the stock cast. */
  useEffect(() => {
    if (mode !== "speech") return undefined;
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch("/api/voice-profiles?status=ready", { retries: 0 });
        const data = await res.json();
        if (alive) setProfiles(data.profiles || []);
      } catch {
        /* stock voices only */
      }
    })();
    return () => { alive = false; };
  }, [mode]);
  const { loading: generating, result, error, elapsed, stage, submit, cancel, reset } = useAsyncGeneration();

  /* Pools go through the group map, then audioKind — the honest per-model
     sub-kind (E1.1). The old code split on `m.provider`, which the public
     catalog never emits, so its Suno exclusion was dead code. */
  const available = useMemo(() => {
    const kind = MODES[mode].kind;
    return (models || []).filter((m) => matchesGroup(m, "audio") && audioKind(m) === kind);
  }, [models, mode]);

  const model = available.find((m) => m.id === modelId) || available[0] || null;

  useEffect(() => {
    if (available.length && !available.some((m) => m.id === modelId)) setModelId(available[0].id);
  }, [available, modelId]);

  useEffect(() => {
    if (!templateConfig) return;
    if (templateConfig.prompt) setText(templateConfig.prompt);
    if (templateConfig.voice) setVoice(templateConfig.voice);
    if (templateConfig.model) setModelId(templateConfig.model);
    /* templateConfig.mode is honored by the AudioStudio wrapper below —
       the mode lives in the URL now (S1). */
  }, [templateConfig]);

  /* `durations` is always an array — [] when the model does not offer a
     choice. This is the real field the old `hasDuration`-style flags never
     were, so the control appears exactly when the model can honour it. */
  const durations = model?.durations?.length ? model.durations.map(Number).filter(Number.isFinite) : [];

  useEffect(() => {
    if (!durations.length) { setDuration(null); return; }
    if (!durations.includes(duration)) setDuration(durations[0]);
  }, [durations, duration]);

  const copy = MODES[mode];
  const spoken = mode === "speech" || mode === "dialogue";
  const wantsVoice = spoken && offers(model, "voice", "voice_id");
  const wantsTone = mode === "speech" && offers(model, "stability", "similarity_boost", "speed");
  const wantsSource = mode === "voice";

  /* Same params, same tool string, as the submit below — a mismatch would
     quote one price and charge another. */
  const costParams = useMemo(() => ({
    prompt: text,
    ...(duration != null ? { duration } : {}),
    ...(source?.url ? { audio_url: source.url } : {}),
  }), [text, duration, source]);

  const { cost, affordable, balance, shortfall } = useCreditCost("audio", model?.id || "", costParams);


  const url = mediaUrl(result);
  const { peaks, real } = useWaveform(url);
  const { ref, playing, current, duration: playLength, toggle, seek } = useTransport(url);
  const shownPeaks = peaks || (playLength ? placeholderPeaks(playLength) : null);
  const progress = playLength > 0 ? Math.min(1, current / playLength) : 0;

  const generate = useCallback(() => {
    if (!model || !text.trim()) return;
    submit("audio", model.id, {
      endpoint: model.endpoint || model.id,
      prompt: text.trim(),
      ...(wantsVoice && voice ? { voice } : {}),
      ...(wantsTone ? { stability, similarity_boost: similarity, speed } : {}),
      ...(duration != null ? { duration } : {}),
      ...(source?.url ? { audio_url: source.url } : {}),
    });
  }, [model, text, submit, wantsVoice, voice, wantsTone, stability, similarity, speed, duration, source]);

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <ModelPicker
        models={available}
        value={model?.id}
        onSelect={setModelId}
        loading={loadingModels}
        label={copy.pickerLabel}
        emptyHint={copy.empty}
      />

      {wantsVoice && (
        <Field label="Voice" hint="Pick a timbre. Models that ship their own cast ignore this.">
          <Chips
            label="Voice"
            scroll
            value={voice}
            onChange={(v) => setVoice(v === voice ? "" : v)}
            options={[
              ...VOICES.map((v) => ({ value: v.id, label: v.label, title: v.desc })),
              /* S2 — the user's own cloned voices, by provider voiceId. */
              ...profiles
                .filter((p) => p.voiceId)
                .map((p) => ({ value: p.voiceId, label: p.name, title: "Your cloned voice" })),
            ]}
          />
        </Field>
      )}

      {wantsTone && (
        <Group label="Delivery">
          <Slider
            label="Stability"
            value={stability}
            onChange={setStability}
            min={0} max={1} step={0.05}
            format={(n) => n.toFixed(2)}
          />
          <Slider
            label="Similarity"
            value={similarity}
            onChange={setSimilarity}
            min={0} max={1} step={0.05}
            format={(n) => n.toFixed(2)}
          />
          <Slider
            label="Speed"
            value={speed}
            onChange={setSpeed}
            min={0.7} max={1.2} step={0.05}
            format={(n) => `${n.toFixed(2)}×`}
          />
          <span className="hs-hint">
            Low stability varies the read more. High similarity holds the voice closer to its
            reference.
          </span>
        </Group>
      )}

      {durations.length > 0 && (
        <Field label="Length" hint="Lengths this model offers.">
          <Chips
            label="Length"
            value={duration}
            onChange={setDuration}
            options={durations.map((d) => ({ value: d, label: `${d}s` }))}
          />
        </Field>
      )}

      {wantsSource && (
        <Field label="Reference track" hint="Optional. The voice is learned from what you attach.">
          <Dropzone
            value={null}
            onChange={setSource}
            accept="audio/*"
            label={source ? "Replace the reference track" : "Drop an audio file or browse"}
            hint="MP3 or WAV"
          />
          {source && (
            <div className="hs-row hs-row--between" style={{ marginTop: "var(--s-2)" }}>
              <span className="hs-hint" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {source.name || "Reference track"}
              </span>
              <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={() => setSource(null)}>
                Remove
              </button>
            </div>
          )}
        </Field>
      )}

      <Group label="This render">
        <Specs
          rows={[
            { k: "Job", v: copy.label },
            { k: "Model", v: model?.displayName || model?.name },
            { k: "Voice", v: wantsVoice ? (VOICES.find((v) => v.id === voice)?.label || "Model default") : null },
            { k: "Len", v: duration != null ? `${duration}s` : null },
            { k: "Src", v: source ? "Attached" : null },
          ]}
        />
      </Group>
    </div>
  );

  /* ── Body ─────────────────────────────────────────────────────────────── */
  const settings = [
    model?.displayName || model?.name,
    wantsVoice && voice ? VOICES.find((v) => v.id === voice)?.label : null,
    duration != null ? `${duration}s` : null,
  ].filter(Boolean).join(" · ");

  const failed = !!error && !generating && !url;

  const body = (
    <div className="st-wave__body">
      {/* Errors go through the kit's Stage error path (Fault) — the same
          surface every Workspace studio uses — so this tool inherits the
          ErrorPanel upgrade (retry, error ids) the moment it lands. */}
      {failed && <Fault error={error} onRetry={generate} />}

      <div className="hs-row hs-row--between">
        <span className="hs-eyebrow">
          {generating ? "Rendering" : url ? "Generated" : copy.eyebrow}
        </span>
        <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-mute)" }}>
          {generating
            ? `${String(stage || "working").replace(/_/g, " ")} · ${clock(elapsed)}`
            : settings || "No model selected"}
        </span>
      </div>

      <Waveform
        peaks={shownPeaks}
        progress={progress}
        onSeek={url ? seek : undefined}
        muted={!url}
        label={url ? "Generated audio waveform" : "Empty waveform"}
      />

      <Transport
        playing={playing}
        current={current}
        duration={playLength}
        onToggle={toggle}
        onSeek={seek}
        disabled={!url}
      />

      {url && !real && (
        <span className="hs-hint" style={{ textAlign: "center" }}>
          The waveform is an estimate — this browser was not allowed to read the file to draw its
          peaks. Playback, the playhead and the timecode are exact.
        </span>
      )}

      {/* The element the transport drives. No `crossOrigin` — asking for CORS
          on a host that does not send it would block playback outright. */}
      <audio ref={ref} src={url || undefined} preload="metadata" style={{ display: "none" }} />

      {url ? (
        <div className="hs-row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
          <a className="hs-btn hs-btn--sm" href={url} download target="_blank" rel="noopener noreferrer">
            <IcDownload className="hs-icon-sm" /> Download
          </a>
          <a className="hs-btn hs-btn--ghost hs-btn--sm" href={url} target="_blank" rel="noopener noreferrer">
            <IcExternal className="hs-icon-sm" /> Open
          </a>
          <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={reset}>
            <IcRefresh className="hs-icon-sm" /> Start over
          </button>
          <span className="hs-mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--tx-mute)" }}>
            {result?.creditsUsed != null ? `${result.creditsUsed} cr` : ""}
            {result?.elapsed != null ? ` · ${result.elapsed}s` : ""}
          </span>
        </div>
      ) : (
        !generating && !failed && (
          <div className="hs-empty">
            <span className="hs-empty__mark"><IcMic /></span>
            <h3>{copy.emptyTitle}</h3>
            <p>{copy.emptyBody}</p>
            <div className="hs-chips" style={{ justifyContent: "center", marginTop: "var(--s-2)" }}>
              {copy.examples.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="hs-chip"
                  style={{ fontFamily: "var(--ff-ui)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}
                  title={e}
                  onClick={() => setText(e)}
                >
                  {e.length > 44 ? `${e.slice(0, 44)}…` : e}
                </button>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );

  return (
    <div className="st-wave">
      <aside className="st-wave__controls" aria-label="Settings">{controls}</aside>

      <div className="st-wave__main">
        {body}

        <div className="st-panel-tabs">
          <button type="button" className="hs-btn hs-btn--sm" onClick={() => setSheet(true)}>
            <IcSettings className="hs-icon-sm" /> Settings
          </button>
        </div>

        <Brief
          tool="audio"
          value={text}
          onChange={setText}
          onSubmit={generate}
          onCancel={cancel}
          generating={generating}
          stage={stage}
          disabled={!model}
          cost={cost || 0}
          balance={balance}
          affordable={affordable}
          shortfall={shortfall}
          maxChars={copy.maxChars}
          submitLabel={copy.submitLabel}
          placeholder={copy.placeholder}
        />
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Settings">
        {controls}
      </Sheet>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   S1 — the studio: mode strip + the active mode's body
   ──────────────────────────────────────────────────────────────────────────
   The four speech jobs stay exactly as they were (AudioGenBody above); the
   mode switch moves from an in-controls Segmented to the URL-driven strip
   every consolidated studio wears, and gains a fifth mode: Tools, mounting
   the AudioToolsStudio body (isolate, clean, convert, reshape) whole —
   /studio/audio-tools redirects here. Each body is keyed by mode, so one
   mode's state never bleeds into another.
   ══════════════════════════════════════════════════════════════════════════ */
const MODE_IDS = ["speech", "dialogue", "voice", "sfx", "tools"];
const MODE_OPTIONS = [
  ...Object.entries(MODES).map(([value, m]) => ({ value, label: m.label })),
  { value: "tools", label: "Tools" },
];

export default function AudioStudio(props) {
  const { mode, setMode } = useStudioMode({ modes: MODE_IDS, fallback: "speech" });

  /* Legacy templates carry a mode ("sound" for what is now sfx) — honor it
     once by moving it into the URL. */
  const appliedTemplateMode = useRef(false);
  useEffect(() => {
    const wanted = props.templateConfig?.mode;
    if (!wanted || appliedTemplateMode.current) return;
    appliedTemplateMode.current = true;
    const next = wanted === "sound" ? "sfx" : wanted;
    if (MODE_IDS.includes(next) && next !== mode) setMode(next);
  }, [props.templateConfig, mode, setMode]);

  return (
    <div className="st-moded">
      <ModeBar label="Audio job" value={mode} onChange={setMode} options={MODE_OPTIONS} />
      <div className="st-moded__body" key={mode}>
        {mode === "tools" ? (
          <AudioToolsStudio {...props} />
        ) : mode === "voice" ? (
          /* S2 — the Voice-clone mode is the wizard now. The old single-shot
             "Build voice" submit mapped to nothing the real API takes
             (audit: audio-music.md) — the stepper drives the real
             validate → phrase → generate → record-info flow and persists a
             VoiceProfile at each transition. */
          <VoiceCloneWizard onCreditsChanged={props.onCreditsChanged} />
        ) : (
          <AudioGenBody {...props} mode={mode} />
        )}
      </div>
    </div>
  );
}
