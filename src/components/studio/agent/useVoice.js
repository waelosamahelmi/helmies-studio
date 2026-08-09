"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";

/* ══════════════════════════════════════════════════════════════════════════
   VOICE — holding a button to talk, and being talked back to
   ──────────────────────────────────────────────────────────────────────────
   Two halves, deliberately asymmetric:

   LISTENING goes to the server. The browser has its own SpeechRecognition,
   and it is tempting because it is free and instant — but it exists in one
   browser, mishears every model name in the catalog ("Seedance" becomes "see
   dance"), and silently reports nothing at all when the user's locale is not
   one it supports. A recording sent to a model that already knows what
   Seedance is gets it right. The cost is a second of latency, paid once per
   utterance.

   SPEAKING stays in the browser. speechSynthesis is instant, free, and
   needs no round trip — and in a call, latency is the ENTIRE experience. A
   generated voice that is more beautiful and arrives two seconds later makes
   the call feel broken, so this is not a quality compromise, it is the right
   trade.
   ══════════════════════════════════════════════════════════════════════════ */

const MIME_PREFERENCE = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of MIME_PREFERENCE) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return null;
}

/**
 * Record, then transcribe.
 *
 * `onText` fires with the words. A recording with no speech in it resolves
 * to nothing and fires nothing: a stray button press must not send an empty
 * turn to the agent.
 */
export function useVoiceInput({ onText } = {}) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const ctxRef = useRef(null);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    // The microphone light stays on until every track is stopped — leaving
    // it lit after a call is over is alarming, and rightly so.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close?.().catch(() => {});
    ctxRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => teardown, [teardown]);

  const transcribe = useCallback(async (blob) => {
    if (!blob || blob.size < 1200) return "";      // a tap, not an utterance
    setTranscribing(true);
    setError("");
    try {
      const form = new FormData();
      form.append("audio", blob, `speech.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
      const res = await apiFetch("/api/agent/transcribe", { method: "POST", body: form, timeout: 120000, retries: 0 });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || "That recording could not be understood.");
      return data?.text || "";
    } catch (e) {
      setError(e?.message || "That recording could not be understood.");
      return "";
    } finally {
      setTranscribing(false);
    }
  }, []);

  const start = useCallback(async () => {
    if (recording) return;
    setError("");
    const mime = pickMime();
    if (!mime) { setError("This browser cannot record audio."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // The three that matter for speech into a laptop microphone in a
        // room with a fan in it.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      // A live level meter, so a held button visibly IS recording. Without
      // it a failed microphone permission looks identical to silence.
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        ctxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        analyserRef.current = analyser;
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
          setLevel(Math.min(1, peak / 90));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch { /* the meter is a nicety; recording matters more */ }

      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      recorderRef.current = rec;
      rec.start(250);
      setRecording(true);
    } catch {
      setError("The microphone is not available. Check the browser's permission for this site.");
      teardown();
    }
  }, [recording, teardown]);

  const stop = useCallback(async ({ send = true } = {}) => {
    const rec = recorderRef.current;
    if (!rec) return "";
    const done = new Promise((resolve) => { rec.onstop = () => resolve(); });
    try { rec.stop(); } catch { /* already stopped */ }
    await done;
    recorderRef.current = null;
    setRecording(false);
    teardown();

    const blob = new Blob(chunksRef.current, { type: rec.mimeType });
    chunksRef.current = [];
    if (!send) return "";
    const text = await transcribe(blob);
    if (text) onText?.(text);
    return text;
  }, [teardown, transcribe, onText]);

  return { recording, transcribing, error, level, start, stop, setError };
}

/**
 * The agent's voice.
 *
 * Speaks sentence by sentence as they arrive rather than waiting for the
 * whole reply: in a call, being answered after a two-second silence reads as
 * a broken line, and nobody waits politely through it.
 */
export function useVoiceOutput() {
  const [speaking, setSpeaking] = useState(false);
  const queueRef = useRef([]);
  const bufferRef = useRef("");
  const voiceRef = useRef(null);
  const enabledRef = useRef(true);

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!supported) return undefined;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;
      // A natural-sounding English voice if one is installed; the platform
      // default otherwise. Never throw for want of a particular voice.
      voiceRef.current =
        voices.find((v) => /natural|neural|premium/i.test(v.name) && /^en/i.test(v.lang))
        || voices.find((v) => /^en-GB/i.test(v.lang))
        || voices.find((v) => /^en/i.test(v.lang))
        || voices[0];
    };
    pick();
    window.speechSynthesis.addEventListener?.("voiceschanged", pick);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", pick);
  }, [supported]);

  const speakNow = useCallback((text) => {
    if (!supported || !enabledRef.current) return;
    const clean = String(text || "")
      // Markdown read aloud is a stream of asterisks and backticks.
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[*_`#>]/g, "")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    if (voiceRef.current) u.voice = voiceRef.current;
    u.rate = 1.05;
    u.pitch = 1;
    u.onstart = () => setSpeaking(true);
    u.onend = () => {
      queueRef.current.shift();
      if (!queueRef.current.length) setSpeaking(false);
    };
    u.onerror = () => { queueRef.current.shift(); setSpeaking(false); };
    queueRef.current.push(u);
    window.speechSynthesis.speak(u);
  }, [supported]);

  /* Feed the token stream in; complete sentences are spoken as they close.
     Splitting on sentence ends rather than fixed lengths is what keeps the
     prosody from sounding chopped. */
  const feed = useCallback((chunk) => {
    bufferRef.current += chunk;
    const parts = bufferRef.current.split(/(?<=[.!?])\s+/);
    while (parts.length > 1) speakNow(parts.shift());
    bufferRef.current = parts[0] || "";
  }, [speakNow]);

  const flush = useCallback(() => {
    const rest = bufferRef.current.trim();
    bufferRef.current = "";
    if (rest) speakNow(rest);
  }, [speakNow]);

  const cancel = useCallback(() => {
    bufferRef.current = "";
    queueRef.current = [];
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const setEnabled = useCallback((on) => {
    enabledRef.current = !!on;
    if (!on) cancel();
  }, [cancel]);

  return { supported, speaking, feed, flush, speak: speakNow, cancel, setEnabled };
}
