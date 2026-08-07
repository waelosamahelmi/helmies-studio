"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brief, ModelPicker, Sheet, Fault,
  Field, Group, Chips, Toggle, Segmented, Specs,
  clock, mediaUrl,
  IcMusic, IcSettings, IcDownload, IcExternal, IcRefresh,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";
import { audioKind } from "@/lib/model-catalog-core.mjs";
import { apiFetch } from "@/lib/client-fetch";
import TrackWorkbench from "./music/TrackWorkbench";
import { placeholderPeaks, useWaveform, useTransport, Waveform, Transport } from "@/components/studio/kit/Waveform";

/* ══════════════════════════════════════════════════════════════════════════
   MUSIC — composition, on the .st-wave archetype
   ──────────────────────────────────────────────────────────────────────────
   Fixed in this rebuild:
   · `hasInstrumental`, `hasVocalGender`, `hasStyle`, `hasTitle` and
     `hasNegativeTags` gated every optional field in the submit body. The live
     catalog never emits those flags — `serializeCatalogModel`'s public shape
     returns id, capability, credits, schema, constraints and nothing else
     (provider cost basis is server-only) — so the style, title, vocal
     gender, instrumental switch and negative tags the user set were silently
     dropped from every single request. They are now
     gated on the model's own input schema (a field the catalog does emit),
     defaulting to "send it" when a model declares no schema.
   · `error` from useAsyncGeneration was never rendered; failures were silent.
   · `elapsed` was unused; the transport line now shows it while a job runs.
   · The result was an <audio controls> with ten decorative bars beside it.
     The waveform is decoded from the returned track.
   ══════════════════════════════════════════════════════════════════════════ */


/* The only capability signal the live catalog carries is the model's own
   input schema. No schema means "unknown", and unknown is not a reason to
   hide a field — the provider drops what it does not take. */
function offers(model, ...fields) {
  const declared = model?.schema?.fields;
  if (!declared) return true;
  return fields.some((f) => !!declared[f]);
}

/* 14 genres. The chips write the model's `style` string — the label says
   Genre because that is what these are; mood and tempo are appended to the
   same string below. */
const STYLES = [
  "cinematic", "orchestral", "ambient", "lo-fi", "synthwave", "electronic",
  "house", "trap", "hip-hop", "rock", "jazz", "classical", "folk", "pop",
];

const FALLBACK_LENGTHS = [30, 60, 90, 120, 180, 240];

const EXAMPLES = [
  "Slow build, muted piano over sub bass, no drums until the second half",
  "Driving four-on-the-floor, analogue synths, bright but not cheerful",
  "Solo cello, room tone, one long phrase repeated with variation",
  "Late-night radio soul, tape hiss, brushed drums, warm bass",
];

export default function MusicStudio({ initialModel, templateConfig, onCreditsChanged }) {
  const [modelId, setModelId] = useState(initialModel || null);
  const [brief, setBrief] = useState("");
  const [style, setStyle] = useState([]);
  const [mood, setMood] = useState("");
  const [tempo, setTempo] = useState("");
  const [title, setTitle] = useState("");
  const [negativeTags, setNegativeTags] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [vocalGender, setVocalGender] = useState("f");
  const [duration, setDuration] = useState(60);
  const [sheet, setSheet] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [profileId, setProfileId] = useState("");
  const [workbenchKey, setWorkbenchKey] = useState(0);

  const { models, loading: loadingModels } = useModelCatalog({});

  /* S2 — the user's ready VoiceProfiles list alongside the stock vocal
     options. A fetch failure just leaves the stock options — the picker is
     an addition, never a gate. */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch("/api/voice-profiles?status=ready", { retries: 0 });
        const data = await res.json();
        if (alive) setProfiles(data.profiles || []);
      } catch {
        /* stock options only */
      }
    })();
    return () => { alive = false; };
  }, []);
  const { loading: generating, result, error, elapsed, stage, submit, cancel, reset } = useAsyncGeneration();

  /* Composition models ONLY (EDITSv1 E1.4): audioKind === "music". The old
     filter took the whole coarse-"audio" capability, so converters,
     isolators and lyric generators all showed up as "composers" — those
     live in Audio Tools now. */
  const available = useMemo(
    () => (models || []).filter((m) => matchesGroup(m, "audio") && audioKind(m) === "music"),
    [models],
  );

  const model = available.find((m) => m.id === modelId) || available[0] || null;

  useEffect(() => {
    if (available.length && !available.some((m) => m.id === modelId)) setModelId(available[0].id);
  }, [available, modelId]);

  useEffect(() => {
    if (!templateConfig) return;
    if (templateConfig.prompt) setBrief(templateConfig.prompt);
    if (templateConfig.title) setTitle(templateConfig.title);
    if (templateConfig.style) setStyle(String(templateConfig.style).split(",").map((s) => s.trim()).filter(Boolean));
    if (templateConfig.model) setModelId(templateConfig.model);
    if (typeof templateConfig.instrumental === "boolean") setInstrumental(templateConfig.instrumental);
  }, [templateConfig]);

  /* `durations` is always an array — [] when the model offers no choice. This
     is a field the catalog genuinely emits, unlike the `has*` flags. */
  const lengths = model?.durations?.length
    ? model.durations.map(Number).filter(Number.isFinite)
    : FALLBACK_LENGTHS;
  const modelSetsLength = !!model?.durations?.length;

  useEffect(() => {
    if (lengths.length && !lengths.includes(duration)) setDuration(lengths[0]);
  }, [lengths, duration]);

  const wantsStyle = offers(model, "style", "tags");
  const wantsTitle = offers(model, "title");
  const wantsVocals = offers(model, "instrumental", "vocal_gender");
  const wantsNegative = offers(model, "negative_tags");

  /* Genre chips + free-text mood + tempo all feed the model's ONE `style`
     string — Suno takes descriptive prompt text, not a tempo parameter, so
     the tempo control is honestly a prompt hint ("at N BPM"), never an
     invented API field. */
  const styleText = useMemo(() => {
    const parts = [...style];
    if (mood.trim()) parts.push(mood.trim());
    if (tempo.trim()) parts.push(`at ${tempo.trim().replace(/\s*bpm$/i, "")} BPM`);
    return parts.join(", ");
  }, [style, mood, tempo]);

  /* Identical tool string and params on both sides of the quote. */
  const costParams = useMemo(
    () => ({ duration, prompt: brief, ...(wantsStyle && styleText ? { style: styleText } : {}) }),
    [duration, brief, wantsStyle, styleText],
  );

  const { cost, affordable, balance, shortfall } = useCreditCost("audio", model?.id || "", costParams);

  useEffect(() => {
    if (!result) return;
    onCreditsChanged?.();
    /* A finished composition is a Generation — the workbench's track list
       refreshes to include it. */
    setWorkbenchKey((k) => k + 1);
  }, [result, onCreditsChanged]);

  const url = mediaUrl(result);
  const { peaks, real } = useWaveform(url);
  const { ref, playing, current, duration: playLength, toggle, seek } = useTransport(url);
  const shownPeaks = peaks || (playLength ? placeholderPeaks(playLength) : null);
  const progress = playLength > 0 ? Math.min(1, current / playLength) : 0;

  const vocalWord = vocalGender === "m" ? "male" : "female";

  const suggestedTitle = useMemo(() => {
    if (title.trim()) return title.trim();
    const head = style.slice(0, 2).join(" ");
    const tail = instrumental ? "instrumental" : `${vocalWord} vocal`;
    return head ? `${head} — ${tail}` : "";
  }, [title, style, instrumental, vocalWord]);

  const toggleStyle = useCallback((tag) => {
    setStyle((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }, []);

  /* S2 — the chosen cloned voice rides the generate body as `persona_id`,
     the documented reusable-voice field the music route accepts. Only when
     the take actually has vocals. */
  const chosenProfile = profiles.find((p) => p.id === profileId) || null;

  const generate = useCallback(() => {
    if (!model || !brief.trim()) return;
    submit("audio", model.id, {
      endpoint: model.endpoint || model.id,
      prompt: brief.trim(),
      duration,
      ...(wantsStyle && styleText ? { style: styleText } : {}),
      ...(wantsTitle && suggestedTitle ? { title: suggestedTitle } : {}),
      ...(wantsVocals ? { instrumental, ...(instrumental ? {} : { vocal_gender: vocalGender }) } : {}),
      ...(wantsVocals && !instrumental && chosenProfile?.voiceId ? { persona_id: chosenProfile.voiceId } : {}),
      ...(wantsNegative && negativeTags.trim() ? { negative_tags: negativeTags.trim() } : {}),
    });
  }, [
    model, brief, submit, duration, wantsStyle, styleText, wantsTitle, suggestedTitle,
    wantsVocals, instrumental, vocalGender, chosenProfile, wantsNegative, negativeTags,
  ]);

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <ModelPicker
        models={available}
        value={model?.id}
        onSelect={setModelId}
        loading={loadingModels}
        label="Composer"
        emptyHint="No music models in the catalog yet."
      />

      {wantsStyle && (
        <Field label="Genre" hint="Stack a few. Order does not matter.">
          <Chips
            label="Genre"
            scroll
            options={STYLES.map((s) => ({ value: s, label: s }))}
            value={style}
            onChange={toggleStyle}
            compare={(selected, tag) => Array.isArray(selected) && selected.includes(tag)}
          />
        </Field>
      )}

      {wantsStyle && (
        <Field label="Mood" hint="Free text, added to the style brief.">
          {(id) => (
            <input
              id={id}
              className="hs-input"
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              placeholder="melancholic, triumphant, late-night…"
            />
          )}
        </Field>
      )}

      {wantsStyle && (
        <Field label="Tempo" hint="A prompt hint — written into the style text as “at N BPM”, not a hard parameter.">
          {(id) => (
            <input
              id={id}
              className="hs-input"
              inputMode="numeric"
              value={tempo}
              onChange={(e) => setTempo(e.target.value)}
              placeholder="e.g. 96"
            />
          )}
        </Field>
      )}

      {wantsVocals && (
        <Group label="Voice">
          <Toggle
            checked={instrumental}
            onChange={setInstrumental}
            label="Instrumental only"
            hint="No lead vocal, no lyrics."
          />
          {!instrumental && (
            <Segmented
              label="Vocal register"
              value={vocalGender}
              onChange={setVocalGender}
              options={[
                { value: "f", label: "Female" },
                { value: "m", label: "Male" },
              ]}
            />
          )}
          {!instrumental && profiles.length > 0 && (
            <Field label="Your voices" hint="Cloned voices you built in Audio → Voice cloning.">
              <Chips
                label="Your voices"
                scroll
                value={profileId}
                onChange={(v) => setProfileId(v === profileId ? "" : v)}
                options={profiles.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
          )}
        </Group>
      )}

      <Field
        label="Length"
        hint={modelSetsLength ? "Lengths this model offers." : "Target length. The model may land close rather than exact."}
      >
        <Chips
          label="Length"
          scroll
          value={duration}
          onChange={setDuration}
          options={lengths.map((d) => ({
            value: d,
            label: d >= 60 && d % 60 === 0 ? `${d / 60}m` : `${d}s`,
          }))}
        />
      </Field>

      {wantsTitle && (
        <Field label="Title" hint={suggestedTitle && !title ? `Blank uses “${suggestedTitle}”.` : undefined}>
          {(id) => (
            <input
              id={id}
              className="hs-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={suggestedTitle || "Name the track"}
            />
          )}
        </Field>
      )}

      {wantsNegative && (
        <Field label="Avoid" hint="Sounds or treatments to keep out.">
          {(id) => (
            <input
              id={id}
              className="hs-input"
              value={negativeTags}
              onChange={(e) => setNegativeTags(e.target.value)}
              placeholder="autotune, distortion, spoken word"
            />
          )}
        </Field>
      )}

      <Group label="This take">
        <Specs
          rows={[
            { k: "Model", v: model?.displayName || model?.name },
            { k: "Len", v: `${duration}s` },
            { k: "Style", v: styleText || "Unset" },
            { k: "Voice", v: wantsVocals ? (instrumental ? "Instrumental" : `${vocalWord} vocal`) : null },
            { k: "Title", v: suggestedTitle || null },
          ]}
        />
      </Group>
    </div>
  );

  /* ── Body ─────────────────────────────────────────────────────────────── */
  const settings = [
    model?.displayName || model?.name,
    `${duration}s`,
    instrumental ? "instrumental" : styleText || null,
  ].filter(Boolean).join(" · ");

  const failed = !!error && !generating && !url;

  const body = (
    <div className="st-wave__body">
      {/* Errors go through the kit's Stage error path (Fault) — this surface
          inherits the ErrorPanel upgrade (retry, error ids) at merge. */}
      {failed && <Fault error={error} onRetry={generate} />}

      <div className="hs-row hs-row--between">
        <span className="hs-eyebrow">
          {generating ? "Composing" : url ? suggestedTitle || "Composed" : "Composition"}
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
        label={url ? "Composed track waveform" : "Empty waveform"}
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

      {/* No `crossOrigin`: demanding CORS from a host that does not send it
          would block playback outright. The waveform degrades instead. */}
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
            <IcRefresh className="hs-icon-sm" /> Compose another
          </button>
          <span className="hs-mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--tx-mute)" }}>
            {result?.creditsUsed != null ? `${result.creditsUsed} cr` : ""}
            {result?.elapsed != null ? ` · ${result.elapsed}s` : ""}
          </span>
        </div>
      ) : (
        !generating && !failed && (
          <div className="hs-empty">
            <span className="hs-empty__mark"><IcMusic /></span>
            <h3>Describe the track</h3>
            <p>
              Say what plays, what does not, and how it moves. Pick the style and length on the
              left, then write the brief below — or paste lyrics and the composer will set them.
            </p>
            <div className="hs-chips" style={{ justifyContent: "center", marginTop: "var(--s-2)" }}>
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="hs-chip"
                  style={{ fontFamily: "var(--ff-ui)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}
                  title={e}
                  onClick={() => setBrief(e)}
                >
                  {e.length > 44 ? `${e.slice(0, 44)}…` : e}
                </button>
              ))}
            </div>
          </div>
        )
      )}

      {/* S2 — track history, timeline and operations on a selected track */}
      <TrackWorkbench refreshKey={workbenchKey} onCreditsChanged={onCreditsChanged} />
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
          tool="music"
          value={brief}
          onChange={setBrief}
          onSubmit={generate}
          onCancel={cancel}
          generating={generating}
          stage={stage}
          disabled={!model}
          cost={cost || 0}
          balance={balance}
          affordable={affordable}
          shortfall={shortfall}
          maxChars={3000}
          submitLabel="Compose"
          placeholder="Describe the track, or paste the lyrics you want set."
        />
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Settings">
        {controls}
      </Sheet>
    </div>
  );
}
