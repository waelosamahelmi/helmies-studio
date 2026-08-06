"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Fault, Field, Dropzone, Specs, clock, IcMic, IcCheck, IcBolt, IcRefresh } from "@/components/studio/kit";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { apiFetch } from "@/lib/client-fetch";

/* ══════════════════════════════════════════════════════════════════════════
   S2 — the voice-clone wizard (AudioStudio's Voice-clone mode)
   ──────────────────────────────────────────────────────────────────────────
   The old surface was a single free-text "Build voice" submit whose one
   field mapped to NOTHING the real API takes (audit: audio-music.md). The
   real Suno flow is a stepper:

     1. validate a recording  → suno-voice-validate (voiceUrl + vocal window)
     2. the provider answers with a PHRASE the user must read aloud
     3. generate the voice    → suno-voice-generate (taskId + verifyUrl)
     4. record-info reports the reusable voiceId → confirm

   A VoiceProfile row is written at each transition (pending → validating →
   generating → ready | failed), so the TTS and Music vocal pickers can list
   the finished voice. Both paid steps quote server-side through
   useCreditCost on the SAME params the submit sends, and both submit
   through the ordinary generation flow — reserve→settle, honest errors
   through Fault. The upstream poll shapes are doc-derived and still
   unverified live; where the provider answers without the documented
   payload the wizard SAYS so instead of pretending.
   ══════════════════════════════════════════════════════════════════════════ */

const VALIDATE_MODEL = "suno-voice-validate";
const GENERATE_MODEL = "suno-voice-generate";

const STEPS = [
  { n: 1, label: "Recording" },
  { n: 2, label: "Read the phrase" },
  { n: 3, label: "Build the voice" },
  { n: 4, label: "Done" },
];

function decodeTextOutput(url) {
  if (typeof url !== "string" || !url.startsWith("data:text/plain")) return null;
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  try {
    const text = decodeURIComponent(url.slice(comma + 1)).trim();
    return text || null;
  } catch {
    return null;
  }
}

export default function VoiceCloneWizard({ onCreditsChanged }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [profile, setProfile] = useState(null);
  const [recording, setRecording] = useState(null);   // step 1 upload
  const [vocalStart, setVocalStart] = useState(0);
  const [vocalEnd, setVocalEnd] = useState(15);
  const [phrase, setPhrase] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [reading, setReading] = useState(null);       // step 2 upload (the read phrase)
  const [wizardError, setWizardError] = useState("");

  const validateGen = useAsyncGeneration();
  const generateGen = useAsyncGeneration();

  /* Best-effort profile writes — a failed PATCH must never strand the paid
     generation, so persistence errors surface as a notice, not a dead end. */
  const patchProfile = useCallback(async (id, body) => {
    try {
      const res = await apiFetch(`/api/voice-profiles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        retries: 0,
      });
      const data = await res.json();
      setProfile(data.profile || null);
      return data.profile;
    } catch (e) {
      setWizardError(e?.message || "Could not save the voice profile update.");
      return null;
    }
  }, []);

  /* ── Step 1: validate the recording ───────────────────────────────────── */
  const validateParams = useMemo(() => ({
    audio_url: recording?.url || "",
    vocalStartS: Number(vocalStart) || 0,
    vocalEndS: Number(vocalEnd) || 0,
  }), [recording, vocalStart, vocalEnd]);

  const validateQuote = useCreditCost(recording?.url ? "audio" : "", VALIDATE_MODEL, validateParams);

  const startValidation = useCallback(async () => {
    if (!name.trim() || !recording?.url || validateGen.loading) return;
    setWizardError("");
    let p = profile;
    if (!p) {
      try {
        const res = await apiFetch("/api/voice-profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
          retries: 0,
        });
        p = (await res.json()).profile;
        setProfile(p);
      } catch (e) {
        setWizardError(e?.message || "Could not create the voice profile.");
        return;
      }
    }
    validateGen.submit("audio", VALIDATE_MODEL, { endpoint: VALIDATE_MODEL, ...validateParams });
    await patchProfile(p.id, { status: "validating" });
  }, [name, recording, validateGen, profile, validateParams, patchProfile]);

  /* Validate settled → read the phrase + the provider taskId the generate
     step chains on (the Generation row's requestId). */
  useEffect(() => {
    if (!validateGen.result || step !== 1) return;
    let alive = true;
    (async () => {
      onCreditsChanged?.();
      setPhrase(decodeTextOutput(validateGen.result.url));
      try {
        const res = await apiFetch("/api/generations?tool=audio&status=completed&limit=25", { retries: 0 });
        const data = await res.json();
        if (!alive) return;
        const row = (data.generations || []).find((g) => g.id === validateGen.result.id);
        setTaskId(row?.requestId || null);
      } catch {
        if (alive) setTaskId(null);
      }
      if (alive) setStep(2);
    })();
    return () => { alive = false; };
  }, [validateGen.result, step, onCreditsChanged]);

  /* A failed paid step marks the profile honestly. */
  useEffect(() => {
    if (validateGen.error && profile && profile.status === "validating") {
      patchProfile(profile.id, { status: "failed" });
    }
  }, [validateGen.error, profile, patchProfile]);

  /* ── Step 3: generate the voice ───────────────────────────────────────── */
  const generateParams = useMemo(() => ({
    taskId: taskId || "",
    audio_url: reading?.url || "",
    voiceName: name.trim(),
  }), [taskId, reading, name]);

  const generateQuote = useCreditCost(reading?.url && taskId ? "audio" : "", GENERATE_MODEL, generateParams);

  const startGeneration = useCallback(async () => {
    if (!reading?.url || !taskId || generateGen.loading) return;
    setWizardError("");
    setStep(3);
    generateGen.submit("audio", GENERATE_MODEL, { endpoint: GENERATE_MODEL, ...generateParams });
    if (profile) await patchProfile(profile.id, { status: "generating" });
  }, [reading, taskId, generateGen, generateParams, profile, patchProfile]);

  useEffect(() => {
    if (!generateGen.result || step !== 3) return;
    let alive = true;
    (async () => {
      onCreditsChanged?.();
      const decoded = decodeTextOutput(generateGen.result.url);
      // The doc says record-info answers with the reusable voiceId; when the
      // envelope differs the raw output reference is stored rather than
      // inventing one, and the confirm screen names which happened.
      const voiceId = decoded || generateGen.result.url || "";
      if (profile) await patchProfile(profile.id, { voiceId, status: "ready" });
      if (alive) setStep(4);
    })();
    return () => { alive = false; };
  }, [generateGen.result, step, profile, patchProfile, onCreditsChanged]);

  useEffect(() => {
    if (generateGen.error && profile && profile.status === "generating") {
      patchProfile(profile.id, { status: "failed" });
    }
  }, [generateGen.error, profile, patchProfile]);

  const restart = useCallback(() => {
    setStep(1);
    setProfile(null);
    setRecording(null);
    setReading(null);
    setPhrase(null);
    setTaskId(null);
    setWizardError("");
    validateGen.reset();
    generateGen.reset();
  }, [validateGen, generateGen]);

  const busy = validateGen.loading || generateGen.loading;
  const activeGen = generateGen.loading || step >= 3 ? generateGen : validateGen;

  return (
    <div className="st-wave__body" style={{ justifyContent: "flex-start" }}>
      <div className="hs-row hs-row--between">
        <span className="hs-eyebrow">Voice cloning</span>
        <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-mute)" }}>
          {busy ? `${String(activeGen.stage || "working").replace(/_/g, " ")} · ${clock(activeGen.elapsed)}` : `Step ${step} of 4`}
        </span>
      </div>

      {/* Stepper */}
      <ol className="st-vcw__steps" aria-label="Voice cloning steps">
        {STEPS.map((s) => (
          <li key={s.n} className={`st-vcw__step${s.n === step ? " is-active" : ""}${s.n < step ? " is-done" : ""}`} aria-current={s.n === step ? "step" : undefined}>
            <span className="st-vcw__no">{s.n < step ? <IcCheck className="hs-icon-sm" /> : s.n}</span>
            {s.label}
          </li>
        ))}
      </ol>

      {wizardError && <p className="hs-notice hs-notice--fault" role="alert">{wizardError}</p>}
      {validateGen.error && !validateGen.loading && <Fault error={validateGen.error} onRetry={startValidation} />}
      {generateGen.error && !generateGen.loading && <Fault error={generateGen.error} onRetry={startGeneration} />}

      {step === 1 && (
        <div className="hs-stack" style={{ gap: "var(--s-4)" }}>
          <Field label="Voice name" hint="How this voice appears in the pickers.">
            {(id) => (
              <input id={id} className="hs-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My narrator" />
            )}
          </Field>
          <Field label="Recording" hint="A clip of the voice to clone. MP3 or WAV.">
            <Dropzone
              value={recording}
              onChange={setRecording}
              accept="audio/*"
              label={recording ? "Replace the recording" : "Drop an audio file or browse"}
              hint="MP3 or WAV"
            />
          </Field>
          <div className="hs-row" style={{ gap: "var(--s-3)", flexWrap: "wrap" }}>
            <Field label="Vocals start (s)">
              {(id) => (
                <input id={id} className="hs-input" inputMode="numeric" style={{ width: 90 }} value={vocalStart} onChange={(e) => setVocalStart(e.target.value)} />
              )}
            </Field>
            <Field label="Vocals end (s)">
              {(id) => (
                <input id={id} className="hs-input" inputMode="numeric" style={{ width: 90 }} value={vocalEnd} onChange={(e) => setVocalEnd(e.target.value)} />
              )}
            </Field>
          </div>
          {validateGen.loading ? (
            <button type="button" className="hs-btn hs-btn--outline" onClick={validateGen.cancel}>
              <span className="hs-spin" /> Validating…
            </button>
          ) : (
            <button
              type="button"
              className="hs-btn hs-btn--primary"
              onClick={startValidation}
              disabled={!name.trim() || !recording?.url || !validateQuote.affordable}
              title={!name.trim() ? "Name the voice first" : !recording?.url ? "Add a recording first" : !validateQuote.affordable ? "Not enough credits" : "Validate the recording"}
            >
              <IcBolt className="hs-icon-sm" /> Validate recording
              {validateQuote.cost > 0 && <span className="hs-btn__cost">{validateQuote.cost}</span>}
            </button>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="hs-stack" style={{ gap: "var(--s-4)" }}>
          <div className="hs-notice" role="status">
            {phrase ? (
              <>Read this phrase aloud, record it, and upload the recording: <strong>“{phrase}”</strong></>
            ) : (
              <>The validation step completed, but the provider did not return a phrase to read — this
              upstream step is still unverified. Upload your verification recording to continue, or
              start over.</>
            )}
          </div>
          {!taskId && (
            <p className="hs-notice hs-notice--fault" role="alert">
              The validation task id could not be read back, so the build step cannot be chained.
              Start over to retry.
            </p>
          )}
          <Field label="Your recording of the phrase" hint="MP3 or WAV.">
            <Dropzone
              value={reading}
              onChange={setReading}
              accept="audio/*"
              label={reading ? "Replace the recording" : "Drop an audio file or browse"}
              hint="MP3 or WAV"
            />
          </Field>
          <div className="hs-row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
            <button
              type="button"
              className="hs-btn hs-btn--primary"
              onClick={startGeneration}
              disabled={!reading?.url || !taskId || !generateQuote.affordable}
              title={!reading?.url ? "Upload the phrase recording first" : !taskId ? "No validation task to chain on" : !generateQuote.affordable ? "Not enough credits" : "Build the voice"}
            >
              <IcBolt className="hs-icon-sm" /> Build the voice
              {generateQuote.cost > 0 && <span className="hs-btn__cost">{generateQuote.cost}</span>}
            </button>
            <button type="button" className="hs-btn hs-btn--ghost" onClick={restart}>
              <IcRefresh className="hs-icon-sm" /> Start over
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="hs-stack" style={{ gap: "var(--s-4)" }}>
          {generateGen.loading ? (
            <button type="button" className="hs-btn hs-btn--outline" onClick={generateGen.cancel}>
              <span className="hs-spin" />
              {String(generateGen.stage || "building").replace(/_/g, " ")}
              <span className="hs-mono" style={{ marginLeft: "var(--s-2)" }}>{clock(generateGen.elapsed)}</span>
            </button>
          ) : (
            !generateGen.error && <p className="hs-hint">Waiting for the voice build to settle…</p>
          )}
          <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={restart}>
            <IcRefresh className="hs-icon-sm" /> Start over
          </button>
        </div>
      )}

      {step === 4 && (
        <div className="hs-stack" style={{ gap: "var(--s-4)" }}>
          <div className="hs-empty">
            <span className="hs-empty__mark"><IcMic /></span>
            <h3>{profile?.name || name || "Voice"} is ready</h3>
            <p>
              It now appears under “Your voices” in Speech and in Music’s vocal options.
            </p>
          </div>
          <Specs
            rows={[
              { k: "Name", v: profile?.name || name },
              { k: "Status", v: profile?.status || "ready" },
              { k: "Voice id", v: profile?.voiceId ? `${String(profile.voiceId).slice(0, 24)}…` : "—" },
            ]}
          />
          <button type="button" className="hs-btn hs-btn--ghost" onClick={restart}>
            <IcRefresh className="hs-icon-sm" /> Clone another voice
          </button>
        </div>
      )}
    </div>
  );
}
