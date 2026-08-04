"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";
import { matchesGroup } from "@/lib/capability-groups";
import { audioKind } from "@/lib/model-catalog-core.mjs";
import { useModelCatalog } from "./useModelCatalog";
import StepPalette from "./workflow/StepPalette";
import StepNode from "./workflow/StepNode";
import {
  Sheet, SpendMeter, ModelPicker, Field, Group, Chips, RatioPicker, Specs,
  IcFlow, IcPlay, IcPlus, IcTrash, IcCheck, IcAlert, IcExternal,
  IcImage, IcVideo, IcMusic, IcMegaphone, IcGrid, IcBrain, IcUpload, IcLayers,
  IcChevron, IcChevronLeft, IcMic, IcFilm, IcZoomIn, IcVolume, IcDownload,
} from "@/components/studio/kit";

/* ══════════════════════════════════════════════════════════════════════════
   WORKFLOWS — .st-flow
   ──────────────────────────────────────────────────────────────────────────
   A pipeline is a straight line: step one feeds step two. So it is drawn as
   a chain, top to bottom, with the connector carrying the direction. Saved
   workflows sit on the left. Each step shows what it costs, quoted by the
   pricing API — the run price is the sum of those quotes, never a guess.
   ══════════════════════════════════════════════════════════════════════════ */

/* The engine (lib/agents.js → executeStep) understands exactly these agents.
   The previous build offered seven invented types — prompt_compile,
   quality_gate, brand_compliance and friends — saved them as the step's
   `agent`, and every run then died on "Unknown agent". Only real agents now.

   Each kind names its model pool: `group` picks the capability groups a
   model must belong to, and `pick` narrows further where a group is too
   coarse to be honest (an upscaler is not a general image editor; a composer
   is not a sound-effects box). Kinds with no pool either write text or run
   entirely on our own machine — assembly shells out to ffmpeg, export only
   describes what the run made — and their prices are fixed server-side in
   pricing-engine.js's NON_PROVIDER_STEP_CREDITS. */
const STEP_KINDS = [
  { id: "image", label: "Image", desc: "Generate or edit an image", icon: IcImage, group: ["tti", "iti"] },
  { id: "i2v", label: "Image to video", desc: "Animate the image from the step before", icon: IcFilm, group: ["i2v"] },
  { id: "upscale", label: "Upscale", desc: "Enlarge the image from the step before", icon: IcZoomIn, group: ["iti"], pick: (m) => m?.capability === "image-upscale" },
  { id: "video", label: "Video", desc: "Generate a video clip from text", icon: IcVideo, group: ["ttv"] },
  { id: "music", label: "Music", desc: "Compose a track", icon: IcMusic, group: ["audio"], pick: (m) => audioKind(m) === "music" },
  { id: "voiceover", label: "Voiceover", desc: "Read the prompt aloud", icon: IcMic, group: ["audio"], pick: (m) => audioKind(m) === "tts" },
  { id: "audio", label: "Audio", desc: "Any audio model — effects, dialogue, tools", icon: IcVolume, group: ["audio"] },
  { id: "assembly", label: "Assemble", desc: "Join every video clip made so far", icon: IcLayers, group: [] },
  { id: "marketing", label: "Marketing", desc: "Write campaign copy or an ad", icon: IcMegaphone, group: [] },
  { id: "website", label: "Website", desc: "Build a page from a brief", icon: IcGrid, group: [] },
  { id: "coding", label: "Code", desc: "Write or explain code", icon: IcBrain, group: [] },
  { id: "export", label: "Export", desc: "Name the deliverable and list every output", icon: IcDownload, group: [] },
];

const KIND_IDS = STEP_KINDS.map((k) => k.id);
const kindOf = (id) => STEP_KINDS.find((k) => k.id === id) || null;

/* Steps that join or describe earlier work rather than generating anything
   new — they take no model and no prompt. */
const CLOSING_KINDS = new Set(["assembly", "export"]);

/* How one clip meets the next in an assembly step. Mirrors
   video-assembly.js's VALID_ASSEMBLY_TRANSITIONS. */
const TRANSITIONS = [
  { value: "cut", label: "Cut" },
  { value: "fade", label: "Fade" },
  { value: "dissolve", label: "Dissolve" },
];

/* Workflows saved by the old builder used these ids. Translate on load so
   existing records still open instead of silently failing at run time. */
const LEGACY_KINDS = { image_gen: "image", video_gen: "video", audio_gen: "audio" };

const pad = (n) => String(n).padStart(2, "0");
const isUrl = (s) => typeof s === "string" && /^(https?:\/\/|\/)/.test(s.trim());
const isVideoUrl = (u) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u) || u.includes("/video/");
const isAudioUrl = (u) => /\.(mp3|wav|ogg|m4a|flac)(\?|$)/i.test(u);

/* A step's output is a URL for anything that generated a file, and a small
   record for the closing export step (which reports the deliverable plus a
   manifest of everything the run made). Both reduce to one thing to open. */
const outputUrl = (output) => {
  if (isUrl(output)) return output;
  if (output && typeof output === "object" && isUrl(output.url)) return output.url;
  return null;
};

let seq = 0;
const newStep = (kind) => {
  const preset = kindOf(kind) || STEP_KINDS[0];
  seq += 1;
  return {
    key: `s${Date.now().toString(36)}${seq}`,
    kind: preset.id,
    name: preset.label,
    model: "",
    prompt: "",
    aspect: "",
    negative: "",
    duration: null,
    transition: "",
  };
};

function stepParams(step) {
  const params = { prompt: step.prompt || "" };
  if (step.model) { params.model = step.model; params.endpoint = step.model; }
  if (step.aspect) params.aspect_ratio = step.aspect;
  if (step.negative) params.negative_prompt = step.negative;
  if (step.duration) params.duration = step.duration;
  if (step.kind === "assembly" && step.transition) params.transition = step.transition;
  return params;
}

const toApiStep = (step) => ({ agent: step.kind, task: step.name || kindOf(step.kind)?.label || step.kind, params: stepParams(step) });

function fromApiStep(raw, i) {
  const kind = LEGACY_KINDS[raw?.agent] || raw?.agent || "image";
  const params = raw?.params || {};
  seq += 1;
  return {
    key: `l${i}${seq}`,
    kind,
    name: raw?.task || kindOf(kind)?.label || `Step ${i + 1}`,
    model: params.model || params.endpoint || "",
    prompt: params.prompt || "",
    aspect: params.aspect_ratio || "",
    negative: params.negative_prompt || "",
    duration: typeof params.duration === "number" ? params.duration : null,
    transition: typeof params.transition === "string" ? params.transition : "",
  };
}

const signature = (name, steps) => JSON.stringify({ name, steps: steps.map(toApiStep) });

/* ── Saved list, shown in the side panel and in the narrow-screen sheet ─── */
function WorkflowList({ workflows, templates, currentId, onOpen, onNew }) {
  return (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Group
        label="Your workflows"
        right={
          <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={onNew}>
            <IcPlus className="hs-icon-sm" /> New
          </button>
        }
      >
        {workflows.length === 0 ? (
          <p className="hs-hint">
            Nothing saved yet. Build a chain on the right and save it to run it again later.
          </p>
        ) : (
          <div className="hs-stack" style={{ gap: "var(--s-2)" }}>
            {workflows.map((wf) => (
              <button
                key={wf.id}
                type="button"
                className={`st-flow__wf${wf.id === currentId ? " is-active" : ""}`}
                onClick={() => onOpen(wf)}
                aria-current={wf.id === currentId ? "true" : undefined}
              >
                <b>{wf.name || "Untitled"}</b>
                <span>
                  {wf.steps?.length || 0} {wf.steps?.length === 1 ? "step" : "steps"}
                  {wf.isPublic ? " · published" : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </Group>

      {templates.length > 0 && (
        <Group label="Templates">
          <div className="hs-stack" style={{ gap: "var(--s-2)" }}>
            {templates.map((tpl) => (
              <button key={tpl.id} type="button" className="st-flow__wf" onClick={() => onOpen(tpl, true)}>
                <b>{tpl.name || "Untitled"}</b>
                <span>{tpl.steps?.length || 0} steps · template</span>
              </button>
            ))}
          </div>
        </Group>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function WorkflowStudio({ onCreditsChanged }) {
  const [workflows, setWorkflows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [current, setCurrent] = useState(null);
  const [name, setName] = useState("Untitled workflow");
  const [steps, setSteps] = useState([]);
  const [savedSig, setSavedSig] = useState(null);

  const [editing, setEditing] = useState(null);      // step key
  const [listOpen, setListOpen] = useState(false);

  const [busy, setBusy] = useState("");              // "" | "save" | "run" | "publish"
  const [regenAt, setRegenAt] = useState(null);      // index of the step being rerun
  const [result, setResult] = useState(null);        // { ok, stepStatus, error, creditsUsed, outputs }
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [balance, setBalance] = useState(null);
  const [quote, setQuote] = useState({ perStep: [], total: null, quoting: false });

  const { models, loading: modelsLoading } = useModelCatalog({});
  const nameRef = useRef(null);

  /* ── Load saved workflows and templates ─────────────────────────────── */
  const loadLists = useCallback(async () => {
    try {
      const [mine, tpl] = await Promise.all([
        apiFetch("/api/workflows").then((r) => r.json()),
        apiFetch("/api/workflows?type=templates").then((r) => r.json()),
      ]);
      setWorkflows(Array.isArray(mine) ? mine : []);
      setTemplates(Array.isArray(tpl) ? tpl : []);
    } catch (err) {
      setError(err?.message || "Could not load your saved workflows.");
    }
  }, []);

  const loadBalance = useCallback(async () => {
    try {
      const res = await apiFetch("/api/credits", { retries: 0 });
      const data = await res.json();
      setBalance(typeof data?.credits === "number" ? data.credits : null);
    } catch {
      /* Leave the balance unknown rather than showing a number we cannot vouch for. */
    }
  }, []);

  useEffect(() => { loadLists(); loadBalance(); }, [loadLists, loadBalance]);

  /* ── Cost: one quote per step, from the pricing API ─────────────────── */
  const quoteKey = useMemo(
    () => JSON.stringify(steps.map((s) => [s.kind, s.model, s.aspect, s.duration])),
    [steps],
  );

  useEffect(() => {
    if (!steps.length) { setQuote({ perStep: [], total: null, quoting: false }); return; }
    let dead = false;
    /* Drop the previous figures immediately — a stale price beside a changed
       step is worse than no price at all. */
    setQuote({ perStep: [], total: null, quoting: true });

    const timer = setTimeout(async () => {
      try {
        const quoted = await Promise.all(
          steps.map(async (step) => {
            const res = await apiFetch("/api/estimate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tool: step.kind, model: step.model || step.kind, params: stepParams(step) }),
              retries: 0,
            });
            const data = await res.json();
            return typeof data?.credits === "number" ? data.credits : null;
          }),
        );
        if (dead) return;
        const total = quoted.length && quoted.every((c) => typeof c === "number")
          ? quoted.reduce((a, b) => a + b, 0)
          : null;
        setQuote({ perStep: quoted, total, quoting: false });
      } catch {
        if (!dead) setQuote({ perStep: [], total: null, quoting: false });
      }
    }, 400);

    return () => { dead = true; clearTimeout(timer); };
  }, [quoteKey]);

  /* ── Step editing ───────────────────────────────────────────────────── */
  /* Any structural change invalidates the last run's per-step ticks. */
  const resetRun = useCallback(() => setResult(null), []);

  const addStep = useCallback((kind) => {
    setSteps((prev) => [...prev, newStep(kind)]);
    resetRun();
    setNotice("");
  }, [resetRun]);

  const changeStep = useCallback((key, change) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...change } : s)));
  }, []);

  const removeStep = useCallback((key) => {
    setSteps((prev) => prev.filter((s) => s.key !== key));
    setEditing((cur) => (cur === key ? null : cur));
    resetRun();
  }, [resetRun]);

  const moveStep = useCallback((key, delta) => {
    setSteps((prev) => {
      const i = prev.findIndex((s) => s.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    resetRun();
  }, [resetRun]);

  const duplicateStep = useCallback((key) => {
    setSteps((prev) => {
      const i = prev.findIndex((s) => s.key === key);
      if (i < 0) return prev;
      seq += 1;
      const copy = { ...prev[i], key: `c${Date.now().toString(36)}${seq}` };
      const next = [...prev];
      next.splice(i + 1, 0, copy);
      return next;
    });
    resetRun();
    setNotice("");
  }, [resetRun]);

  /* ── Drag and drop ──────────────────────────────────────────────────────
     Native HTML5 DnD (same approach as the canvas layer list) — no library.
     What is being dragged is held in a ref rather than read back out of the
     DataTransfer, because `getData` is unreadable during dragover in most
     browsers and blocked outright in some; the DataTransfer payload is still
     written, both because Firefox will not start a drag without one and as
     the fallback for anything that loses the ref. Every drop lands on a GAP,
     and a gap's index is the position the step takes. */
  const dragRef = useRef(null);
  const [dropAt, setDropAt] = useState(null);

  const insertStep = useCallback((kindId, at) => {
    if (!KIND_IDS.includes(kindId)) return;
    setSteps((prev) => {
      const next = [...prev];
      next.splice(Math.min(Math.max(at, 0), next.length), 0, newStep(kindId));
      return next;
    });
    resetRun();
    setNotice("");
  }, [resetRun]);

  const moveStepTo = useCallback((key, at) => {
    setSteps((prev) => {
      const from = prev.findIndex((s) => s.key === key);
      if (from < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      // Removing the step first shifts everything after it down by one, so a
      // drop below its old home lands one slot too far without this.
      const target = at > from ? at - 1 : at;
      next.splice(Math.min(Math.max(target, 0), next.length), 0, item);
      return next;
    });
    resetRun();
  }, [resetRun]);

  const onPaletteDragStart = useCallback((e, kindId) => {
    dragRef.current = { type: "palette", kind: kindId };
    try {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("text/plain", `kind:${kindId}`);
    } catch { /* a browser that refuses the write still has the ref */ }
  }, []);

  const onNodeDragStart = useCallback((e, key) => {
    dragRef.current = { type: "node", key };
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `step:${key}`);
    } catch { /* as above */ }
  }, []);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    setDropAt(null);
  }, []);

  const onGapOver = useCallback((e, at) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = dragRef.current?.type === "node" ? "move" : "copy";
    setDropAt(at);
  }, []);

  const onGapLeave = useCallback((at) => {
    setDropAt((cur) => (cur === at ? null : cur));
  }, []);

  const onGapDrop = useCallback((e, at) => {
    e.preventDefault();
    let payload = dragRef.current;
    if (!payload) {
      const raw = (() => { try { return e.dataTransfer?.getData("text/plain") || ""; } catch { return ""; } })();
      if (raw.startsWith("kind:")) payload = { type: "palette", kind: raw.slice(5) };
      else if (raw.startsWith("step:")) payload = { type: "node", key: raw.slice(5) };
    }
    dragRef.current = null;
    setDropAt(null);
    if (!payload) return;
    if (payload.type === "palette") insertStep(payload.kind, at);
    else moveStepTo(payload.key, at);
  }, [insertStep, moveStepTo]);

  const gapProps = useCallback((at, extra = "") => ({
    "data-testid": `drop-gap-${at}`,
    className: `st-flow__gap${extra ? ` ${extra}` : ""}${dropAt === at ? " is-over" : ""}`,
    onDragOver: (e) => onGapOver(e, at),
    onDragLeave: () => onGapLeave(at),
    onDrop: (e) => onGapDrop(e, at),
    "aria-hidden": "true",
  }), [dropAt, onGapOver, onGapLeave, onGapDrop]);

  /* ── Open a saved workflow or template ──────────────────────────────── */
  const open = useCallback((wf, asCopy = false) => {
    const loaded = (Array.isArray(wf?.steps) ? wf.steps : []).map(fromApiStep);
    const nextName = asCopy ? `${wf?.name || "Untitled"} copy` : wf?.name || "Untitled workflow";
    setCurrent(asCopy ? null : wf);
    setName(nextName);
    setSteps(loaded);
    setSavedSig(asCopy ? null : signature(nextName.trim(), loaded));
    setEditing(null);
    setListOpen(false);
    setResult(null);
    setError("");
    setNotice(asCopy ? "Template loaded. Save it to make it yours." : "");
  }, []);

  const startNew = useCallback(() => {
    setCurrent(null);
    setName("Untitled workflow");
    setSteps([]);
    setSavedSig(null);
    setEditing(null);
    setListOpen(false);
    setResult(null);
    setError("");
    setNotice("");
    nameRef.current?.focus();
  }, []);

  /* ── Save ───────────────────────────────────────────────────────────── */
  const save = useCallback(async () => {
    const title = name.trim();
    if (!title || !steps.length || busy) return;
    setBusy("save");
    setError("");
    setNotice("");
    const payload = { name: title, description: current?.description || "", steps: steps.map(toApiStep) };

    try {
      let saved;
      if (current?.id) {
        /* PATCH lives on .../run — that route file exports POST, DELETE and
           PATCH together, and PATCH is the only update endpoint that exists.
           POST /api/workflows always creates, so using it here would leave a
           duplicate record behind on every save. */
        await apiFetch(`/api/workflows/${current.id}/run`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          retries: 0,
        });
        saved = { ...current, ...payload };
      } else {
        const res = await apiFetch("/api/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          retries: 0,
        });
        const data = await res.json();
        saved = data?.workflow || null;
      }
      if (saved) setCurrent(saved);
      setSavedSig(signature(title, steps));
      setNotice(`Saved “${title}”.`);
      await loadLists();
    } catch (err) {
      setError(err?.message || "Saving failed. Check your connection and try again.");
    } finally {
      setBusy("");
    }
  }, [name, steps, busy, current, loadLists]);

  /* ── Run — the server executes the saved version, so unsaved edits block it ── */
  const run = useCallback(async () => {
    if (!current?.id || busy) return;
    setBusy("run");
    setError("");
    setNotice("");
    setResult({ running: true, stepStatus: {}, outputs: [] });

    try {
      const res = await apiFetch(`/api/workflows/${current.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: { prompt: steps[0]?.prompt || "" } }),
        timeout: 600000,
        retries: 0,
      });
      const data = await res.json();

      /* Per-step status AND per-step output, both keyed by step index, so a
         card can show what it made without a second request — the engine
         records the same pair onto WorkflowRun.outputs as it goes. */
      const stepStatus = {};
      const stepOutputs = {};
      (data?.stepResults || []).forEach((r, i) => {
        const index = (r.step || i + 1) - 1;
        stepStatus[index] = r.status === "completed" ? "done" : "failed";
        const url = outputUrl(r.output);
        if (url) stepOutputs[index] = url;
      });

      setResult({
        running: false,
        ok: !!data?.success,
        stepStatus,
        stepOutputs,
        error: data?.success ? "" : data?.error || "The run stopped before it finished.",
        creditsUsed: typeof data?.creditsUsed === "number" ? data.creditsUsed : null,
        outputs: (data?.outputs || []).map(outputUrl).filter(Boolean),
      });
      if (!data?.success) setError(data?.error || "The run stopped before it finished.");
    } catch (err) {
      setResult({ running: false, ok: false, stepStatus: {}, stepOutputs: {}, error: err?.message || "The run failed.", outputs: [] });
      setError(err?.message || "The run failed.");
    } finally {
      setBusy("");
      loadBalance();
      onCreditsChanged?.();
    }
  }, [current, busy, steps, loadBalance, onCreditsChanged]);

  /* ── Regenerate one step ────────────────────────────────────────────── */
  const regenerate = useCallback(async (index) => {
    if (!current?.id || busy || regenAt != null) return;
    setRegenAt(index);
    setError("");
    setNotice("");
    try {
      const res = await apiFetch(`/api/workflows/${current.id}/regen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepIndex: index, newParams: {} }),
        timeout: 600000,
        retries: 0,
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "The step did not regenerate.");

      const fresh = outputUrl(data.output);
      setResult((prev) => ({
        running: false,
        ok: prev?.ok ?? true,
        stepStatus: { ...(prev?.stepStatus || {}), [index]: "done" },
        stepOutputs: { ...(prev?.stepOutputs || {}), ...(fresh ? { [index]: fresh } : {}) },
        error: "",
        creditsUsed: prev?.creditsUsed ?? null,
        outputs: fresh ? [...(prev?.outputs || []), fresh] : prev?.outputs || [],
      }));
      setNotice(
        `Step ${pad(index + 1)} regenerated${data.creditsUsed != null ? ` for ${data.creditsUsed} credits` : ""}.`,
      );
    } catch (err) {
      setError(err?.message || "The step did not regenerate.");
    } finally {
      setRegenAt(null);
      loadBalance();
      onCreditsChanged?.();
    }
  }, [current, busy, regenAt, loadBalance, onCreditsChanged]);

  /* ── Publish ────────────────────────────────────────────────────────── */
  const publish = useCallback(async () => {
    if (!current?.id || busy) return;
    setBusy("publish");
    setError("");
    setNotice("");
    try {
      const res = await apiFetch(`/api/workflows/${current.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        retries: 0,
      });
      const data = await res.json();
      if (data?.workflow) setCurrent(data.workflow);
      else setCurrent((c) => (c ? { ...c, isPublic: true } : c));
      setNotice("Published. This workflow is now listed publicly.");
      await loadLists();
    } catch (err) {
      setError(err?.message || "Publishing failed.");
    } finally {
      setBusy("");
    }
  }, [current, busy, loadLists]);

  /* ── Derived ────────────────────────────────────────────────────────── */
  const dirty = savedSig == null ? steps.length > 0 : signature(name.trim(), steps) !== savedSig;
  const unsupported = steps.filter((s) => !KIND_IDS.includes(s.kind));
  const total = quote.total;
  const affordable = balance == null || total == null || balance >= total;
  const shortfall = affordable || total == null || balance == null ? 0 : total - balance;
  const running = busy === "run";
  const step = steps.find((s) => s.key === editing) || null;
  const stepIndex = step ? steps.findIndex((s) => s.key === step.key) : -1;

  const stepModels = useMemo(() => {
    const preset = kindOf(step?.kind);
    const groups = preset?.group || [];
    if (!groups.length) return [];
    const inGroup = (models || []).filter((m) => groups.some((g) => matchesGroup(m, g)));
    return preset.pick ? inGroup.filter(preset.pick) : inGroup;
  }, [models, step?.kind]);

  const chosenModel = stepModels.find((m) => m.id === step?.model) || null;
  const ratios = chosenModel?.aspectRatios?.length ? chosenModel.aspectRatios : [];
  const durations = chosenModel?.durations?.length ? chosenModel.durations : [];

  const runBlock =
    !current?.id ? "Save this workflow before running it."
    : dirty ? "Save your changes — a run always uses the saved version."
    : unsupported.length ? "One or more steps use a type this studio can no longer run. Change them first."
    : !steps.length ? "Add at least one step."
    : quote.quoting ? "Working out what this run costs…"
    : total == null ? "The pricing API did not quote every step. Reopen a step to try again."
    : !affordable ? "Not enough credits for this run."
    : "";

  /* ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="st-flow">
      <aside className="st-flow__side" aria-label="Saved workflows">
        <WorkflowList
          workflows={workflows}
          templates={templates}
          currentId={current?.id}
          onOpen={open}
          onNew={startNew}
        />
      </aside>

      <div className="st-flow__main">
        <div className="st-lib__bar">
          <button
            type="button"
            className="hs-btn hs-btn--ghost hs-btn--sm st-flow__open"
            onClick={() => setListOpen(true)}
          >
            <IcLayers className="hs-icon-sm" /> Workflows
          </button>

          <label className="hs-sr" htmlFor="wf-name">Workflow name</label>
          <input
            id="wf-name"
            ref={nameRef}
            className="hs-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this workflow"
            style={{ flex: 1, minWidth: 160 }}
          />

          <button
            type="button"
            className="hs-btn hs-btn--sm"
            onClick={save}
            disabled={!name.trim() || !steps.length || !!busy}
            title={current?.id ? "Update the saved workflow" : "Save this workflow"}
          >
            {busy === "save" ? <span className="hs-spin" style={{ width: 12, height: 12 }} /> : <IcUpload className="hs-icon-sm" />}
            {current?.id ? "Save" : "Save new"}
          </button>

          <button
            type="button"
            className="hs-btn hs-btn--sm"
            onClick={publish}
            disabled={!current?.id || !!busy || current?.isPublic}
            title={current?.isPublic ? "Already published" : "List this workflow publicly"}
          >
            {busy === "publish" ? <span className="hs-spin" style={{ width: 12, height: 12 }} /> : <IcExternal className="hs-icon-sm" />}
            {current?.isPublic ? "Published" : "Publish"}
          </button>
        </div>

        {running && (
          <div className="hs-progress hs-progress--indeterminate" role="status" aria-label="Running the workflow">
            <i />
          </div>
        )}

        {error && (
          <div className="hs-notice hs-notice--fault" role="alert" style={{ margin: "var(--s-3) var(--s-4) 0" }}>
            <IcAlert className="hs-icon-sm" />
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={() => setError("")}>
              Dismiss
            </button>
          </div>
        )}

        {!error && notice && (
          <div className="hs-notice hs-notice--signal" style={{ margin: "var(--s-3) var(--s-4) 0" }}>
            <IcCheck className="hs-icon-sm" />
            <span style={{ flex: 1 }}>{notice}</span>
          </div>
        )}

        <div className="st-flow__body">
          <aside className="st-flow__palette" aria-label="Step types">
            <StepPalette
              kinds={STEP_KINDS}
              onAdd={addStep}
              onDragStart={onPaletteDragStart}
              onDragEnd={onDragEnd}
              disabled={!!busy}
            />
          </aside>

          <div className="st-flow__chain">
          {steps.length === 0 && (
            <div className="hs-empty">
              <span className="hs-empty__mark"><IcFlow /></span>
              <h3>Build a pipeline</h3>
              <p>
                Drag a step type out of the palette, or click one. Each step feeds the next — write{" "}
                <code className="hs-mono">$STEP_1_OUTPUT</code> in a prompt to use what the first
                step produced, or <code className="hs-mono">$INPUT_PROMPT</code> for the run input.
              </p>
            </div>
          )}

          {/* The chain is the list, and each card owns the gap ABOVE it so
              every direct child of the list is still a listitem. The gap
              after the last card lives outside for the same reason — it is a
              drop target and a connector, not a step. */}
          <div className="st-flow__steps" role="list" aria-label="Step chain" aria-busy={running}>
            {steps.map((s, i) => {
              const kind = kindOf(s.kind);
              const status = regenAt === i ? "running" : result?.stepStatus?.[i];

              return (
                <div role="listitem" className="st-flow__slot" key={s.key}>
                  <span {...gapProps(i)} />
                  <StepNode
                    index={i}
                    step={s}
                    kind={kind}
                    cost={quote.perStep[i]}
                    status={status}
                    output={result?.stepOutputs?.[i]}
                    active={editing === s.key}
                    dragging={false}
                    busy={busy || (regenAt != null)}
                    canRerun={!!current?.id && !dirty}
                    first={i === 0}
                    last={i === steps.length - 1}
                    onOpen={() => setEditing(s.key)}
                    onRename={(name) => changeStep(s.key, { name })}
                    onDuplicate={() => duplicateStep(s.key)}
                    onRemove={() => removeStep(s.key)}
                    onRerun={() => regenerate(i)}
                    onMove={(delta) => moveStep(s.key, delta)}
                    onDragStart={onNodeDragStart}
                    onDragEnd={onDragEnd}
                  />
                </div>
              );
            })}
          </div>

          {/* The tail gap: a place to append, and — when there is nothing to
              connect yet — the only thing on the canvas to aim at. */}
          <span {...gapProps(steps.length, steps.length === 0 ? "is-blank" : "is-tail")} />

          {result && !result.running && (
            <div className="st-flow__out hs-card" style={{ marginTop: "var(--s-6)" }}>
              <div className="hs-row hs-row--between">
                <span className="hs-label" style={{ margin: 0 }}>
                  {result.ok ? "Run finished" : "Run stopped"}
                </span>
                {result.creditsUsed != null && (
                  <span className="hs-badge hs-badge--accent hs-mono">{result.creditsUsed} cr</span>
                )}
              </div>

              {result.error && (
                <p className="hs-notice hs-notice--fault" style={{ marginTop: "var(--s-3)" }}>
                  {result.error}
                </p>
              )}

              {result.outputs?.length > 0 && (
                <div className="hs-thumbs" style={{ marginTop: "var(--s-3)" }}>
                  {result.outputs.filter(isUrl).map((url, i) => (
                    <a
                      key={`${url}-${i}`}
                      className="hs-thumb"
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open output ${i + 1} in a new tab`}
                    >
                      {isVideoUrl(url) ? (
                        <video src={url} muted playsInline preload="metadata" />
                      ) : isAudioUrl(url) ? (
                        <span
                          className="hs-mono"
                          style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 10, color: "var(--tx-mute)" }}
                        >
                          AUDIO
                        </span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- next/image would change loading/layout behavior; deferred, out of scope for lint-only stabilization (2026-08-01)
                        <img src={url} alt={`Output ${i + 1}`} />
                      )}
                    </a>
                  ))}
                </div>
              )}

              {result.ok && !result.outputs?.length && (
                <p className="hs-hint" style={{ marginTop: "var(--s-3)" }}>
                  The run finished without producing a file. Check the step prompts.
                </p>
              )}
            </div>
          )}
          </div>
        </div>

        <div className="st-dock-prompt">
          <div className="st-spend">
            <SpendMeter
              cost={total ?? 0}
              balance={balance}
              affordable={affordable}
              shortfall={shortfall}
              label="Run cost"
            />
            <button
              type="button"
              className="hs-btn hs-btn--primary hs-btn--lg"
              onClick={run}
              disabled={!!runBlock || !!busy}
              title={runBlock || `Run all ${steps.length} steps`}
            >
              {running ? <span className="hs-spin" /> : <IcPlay className="hs-icon-sm" />}
              {running ? "Running" : "Run workflow"}
              {total != null && !running && <span className="hs-btn__cost hs-mono">{total}</span>}
            </button>
          </div>
          {runBlock && !running && (
            <p className="hs-hint" style={{ marginTop: "var(--s-2)" }}>{runBlock}</p>
          )}
        </div>
      </div>

      {/* Saved list on narrow screens, where .st-flow__side is hidden */}
      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Workflows">
        <WorkflowList
          workflows={workflows}
          templates={templates}
          currentId={current?.id}
          onOpen={open}
          onNew={startNew}
        />
      </Sheet>

      {/* Step editor */}
      <Sheet
        open={!!step}
        onClose={() => setEditing(null)}
        title={step ? `Step ${pad(stepIndex + 1)}` : "Step"}
        footer={
          step ? (
            <>
              <button
                type="button"
                className="hs-btn hs-btn--ghost"
                onClick={() => moveStep(step.key, -1)}
                disabled={stepIndex <= 0}
                aria-label="Move this step earlier"
              >
                <IcChevronLeft className="hs-icon-sm" /> Earlier
              </button>
              <button
                type="button"
                className="hs-btn hs-btn--ghost"
                onClick={() => moveStep(step.key, 1)}
                disabled={stepIndex < 0 || stepIndex >= steps.length - 1}
                aria-label="Move this step later"
              >
                Later <IcChevron className="hs-icon-sm" />
              </button>
              <button type="button" className="hs-btn hs-btn--danger" onClick={() => removeStep(step.key)}>
                <IcTrash className="hs-icon-sm" /> Remove
              </button>
              <button type="button" className="hs-btn hs-btn--primary" onClick={() => setEditing(null)}>
                Done
              </button>
            </>
          ) : null
        }
      >
        {step && (
          <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
            <Field label="What this step does">
              <Chips
                label="Step type"
                options={STEP_KINDS.map((k) => ({ value: k.id, label: k.label, title: k.desc }))}
                value={step.kind}
                onChange={(kind) => { changeStep(step.key, { kind, model: "", aspect: "", duration: null, transition: "" }); resetRun(); }}
              />
            </Field>

            <Field label="Step name" hint="Shown on the chain and stored with the workflow.">
              {(id) => (
                <input
                  id={id}
                  className="hs-input"
                  value={step.name}
                  onChange={(e) => changeStep(step.key, { name: e.target.value })}
                  placeholder={kindOf(step.kind)?.label || "Step"}
                />
              )}
            </Field>

            {(kindOf(step.kind)?.group || []).length > 0 && (
              <Group label="Model" >
                <ModelPicker
                  models={stepModels}
                  value={step.model}
                  onSelect={(id) => changeStep(step.key, { model: id === step.model ? "" : id, aspect: "" })}
                  loading={modelsLoading}
                  label="Model"
                  emptyHint="No models for this step type are available yet. Leave it unset and the engine picks its own."
                />
              </Group>
            )}

            {!CLOSING_KINDS.has(step.kind) && (
              <Field
                label="Prompt"
                hint="Use $INPUT_PROMPT for the run input and $STEP_1_OUTPUT to pass an earlier result forward."
              >
                {(id) => (
                  <textarea
                    id={id}
                    className="hs-input hs-textarea"
                    value={step.prompt}
                    onChange={(e) => changeStep(step.key, { prompt: e.target.value })}
                    placeholder="Describe what this step should produce."
                  />
                )}
              </Field>
            )}

            {step.kind === "assembly" && (
              <Field label="Between clips" hint="How one clip meets the next in the finished cut.">
                <Chips
                  label="Transition"
                  options={TRANSITIONS}
                  value={step.transition || "cut"}
                  onChange={(transition) => changeStep(step.key, { transition })}
                />
              </Field>
            )}

            {CLOSING_KINDS.has(step.kind) && (
              <p className="hs-hint">
                {step.kind === "assembly"
                  ? "Joins every video clip made earlier in this chain, in order. Runs here rather than at a model, so it costs a flat fee."
                  : "Closes the chain: names the deliverable and lists every file the run produced. Free."}
              </p>
            )}

            {ratios.length > 0 && (
              <Field label="Aspect ratio">
                <RatioPicker options={ratios} value={step.aspect} onChange={(aspect) => changeStep(step.key, { aspect })} />
              </Field>
            )}

            {durations.length > 0 && (
              <Field label="Duration">
                <Chips
                  label="Duration"
                  options={durations.map((d) => ({ value: d, label: `${d}s` }))}
                  value={step.duration}
                  onChange={(duration) => changeStep(step.key, { duration: Number(duration) })}
                />
              </Field>
            )}

            {step.kind === "image" && (
              <Field label="Avoid" hint="Elements the render should exclude.">
                {(id) => (
                  <input
                    id={id}
                    className="hs-input"
                    value={step.negative}
                    onChange={(e) => changeStep(step.key, { negative: e.target.value })}
                    placeholder="text, watermark"
                  />
                )}
              </Field>
            )}

            <Group label="This step">
              <Specs
                rows={[
                  { k: "Type", v: kindOf(step.kind)?.label || step.kind },
                  { k: "Model", v: step.model || "Engine default" },
                  { k: "Cost", v: quote.perStep[stepIndex] == null ? "Not quoted" : `${quote.perStep[stepIndex]} cr` },
                  { k: "Position", v: `${pad(stepIndex + 1)} of ${pad(steps.length)}` },
                ]}
              />
            </Group>
          </div>
        )}
      </Sheet>
    </div>
  );
}
