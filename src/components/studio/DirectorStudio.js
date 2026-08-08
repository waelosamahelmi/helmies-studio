"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet, SpendMeter, Field, Chips, Dropzone, clock,
  IcFilm, IcSettings, IcRefresh, IcPlus, IcExternal, IcImage, IcVideo, IcClose, IcBolt,
  IcBrush, IcCopy, IcTrash, IcChevronLeft, IcChevronRight,
} from "@/components/studio/kit";
import ShotEditor from "@/components/studio/director/ShotEditor";
import Timeline from "@/components/studio/director/Timeline";
import { apiFetch } from "@/lib/client-fetch";
import { PRODUCTION_TYPE_PRESETS } from "@/lib/director-constants";

/* ══════════════════════════════════════════════════════════════════════════
   DIRECTOR — .st-board
   ──────────────────────────────────────────────────────────────────────────
   A film is a sequence of shots, so the interface is that sequence: one
   horizontal strip, numbered, that stacks vertically below 900px. The board
   head carries the production and its real totals; the foot carries the
   brief, the total spend and the single commit action.

   Fixed in this rewrite:
   · `MobileModelCarousel` was imported and never rendered.
   · `approvalMode` and `outputFormat` were rendered as selects and sent to
     nothing — /api/director/plan reads only concept, style, mood, title,
     duration, platform, type, shots, model, and /api/director/execute reads
     only planId and autoAssemble. Both controls are cut, along with the
     `onFailure` select (the execute route never forwards `stopOnFailure`),
     the aspect field and the brand-kit select (the plan route drops both).
   · Production types were `short_form / cinematic / commercial / social_media`
     — none of which exist in PRODUCTION_TYPE_PRESETS, so every plan silently
     fell back to the music-video preset. The list is now built from the
     presets themselves.
   · `if (!res.ok)` guards were dead code: apiFetch throws on any non-2xx.
   · The cost readout added `assemblyCost` on top of `totalCredits`, which
     already includes it.
   ══════════════════════════════════════════════════════════════════════════ */

const TYPES = Object.entries(PRODUCTION_TYPE_PRESETS).map(([value, preset]) => ({
  value,
  label: preset.label,
}));

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "youtube_shorts", label: "Shorts" },
  { value: "x", label: "X" },
  { value: "linkedin", label: "LinkedIn" },
];

const DURATIONS = [15, 30, 60, 90, 120, 180, 300].map((v) => ({ value: v, label: `${v}s` }));

const STARTERS = [
  {
    title: "Cosmic Dancer",
    concept: "A dancer drifts through zero gravity inside a nebula, dust turning with every movement. Neon silhouette against deep violet.",
  },
  {
    title: "Urban Noir",
    concept: "A figure in a wet overcoat walks rain-slicked streets under failing neon. Long shadows, smoke, 1940s framing with a cyberpunk palette.",
  },
  {
    title: "Product Reel",
    concept: "Macro passes over a steel watch case. Hard light rakes across the polished surfaces, slow motion, shallow depth of field.",
  },
  {
    title: "Four Seasons",
    concept: "One tree through a full year. Frost to blossom to dust to snow, morning mist resolving into a low gold sun.",
  },
];

const DONE = new Set(["completed", "complete", "done", "succeeded", "success"]);
const FAILED = new Set(["failed", "error", "cancelled", "canceled"]);
const WORKING = new Set([
  "processing", "running", "generating", "generating_images", "generating_video",
  "generating_audio", "assembling", "quality_check", "executing",
]);

function railClass(status) {
  const s = String(status || "").toLowerCase();
  if (DONE.has(s)) return "is-done";
  if (FAILED.has(s)) return "is-failed";
  if (WORKING.has(s)) return "is-running";
  return "is-queued";
}

const label = (s) => String(s || "").replace(/_/g, " ");
const credits = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

/* The plan route returns the planner's own envelope, so `plan` may be either
   the plan itself or a wrapper around it. Read both rather than trusting one. */
function readPlan(data) {
  const plan =
    data?.plan && Array.isArray(data.plan.shots) ? data.plan
    : data?.plan?.plan && Array.isArray(data.plan.plan.shots) ? data.plan.plan
    : Array.isArray(data?.shots) ? data
    : null;
  return {
    plan,
    costEstimate: data?.costEstimate || data?.plan?.costEstimate || null,
    pipelineId: data?.pipelineId || data?.plan?.pipelineId || data?.plan?.id || null,
  };
}

/* Execution reports arrive in two shapes: the executor's own
   {shotId, success, imageUrl, videoUrl, error} and the pipeline record's
   {id, index, status, imageResult, videoResult, error}. */
function readRun(entry) {
  if (!entry || typeof entry !== "object") return null;
  const status =
    entry.status ||
    (entry.success === true ? "completed" : entry.success === false ? "failed" : null);
  return {
    id: entry.shotId || entry.id || null,
    index: entry.index ?? entry.shotIndex ?? null,
    status,
    imageUrl: entry.imageUrl || entry.imageResult?.url || entry.imageResult?.rawUrl || null,
    videoUrl: entry.videoUrl || entry.videoResult?.url || entry.videoResult?.rawUrl || null,
    error: entry.error || null,
  };
}

export default function DirectorStudio({ templateConfig, onCreditsChanged, initialPipelineId = null }) {
  /* Brief — every field below is sent to /api/director/plan */
  const [title, setTitle] = useState("");
  const [concept, setConcept] = useState("");
  const [type, setType] = useState("music_video");
  const [platform, setPlatform] = useState("youtube");
  const [duration, setDuration] = useState(PRODUCTION_TYPE_PRESETS.music_video.defaultDuration);
  const [style, setStyle] = useState("");
  const [mood, setMood] = useState("");
  /* E4.3: named cast — {key, name, description, referenceUrl} — sent to the
     planner and anchored to real images by the executor. */
  const [characters, setCharacters] = useState([]);

  /* Board */
  const [outline, setOutline] = useState([]);   // shots the user sketches first
  const [plan, setPlan] = useState(null);
  const [costEstimate, setCostEstimate] = useState(null);
  const [pipelineId, setPipelineId] = useState(null);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [runShots, setRunShots] = useState([]);
  const [assembledUrl, setAssembledUrl] = useState(null);
  const [active, setActive] = useState(null);

  /* Session */
  const [recent, setRecent] = useState([]);
  const [balance, setBalance] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);       // "plan" | "execute" | null
  const [rerunning, setRerunning] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /* Shot editor (E4.2) */
  const [editingKey, setEditingKey] = useState(null);
  const [savingPlan, setSavingPlan] = useState(false);

  const pollRef = useRef(null);
  const seq = useRef(0);
  const chosenDuration = useRef(false);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);
  useEffect(() => () => stopPoll(), [stopPoll]);

  /* ── Balance: the meter needs a real number to measure against ────────── */
  const loadBalance = useCallback(async () => {
    try {
      const res = await apiFetch("/api/credits");
      const data = await res.json();
      setBalance(typeof data?.credits === "number" ? data.credits : null);
    } catch { /* the meter falls back to cost-only */ }
  }, []);
  useEffect(() => { loadBalance(); }, [loadBalance]);

  /* ── Earlier productions ──────────────────────────────────────────────── */
  const loadRecent = useCallback(async () => {
    try {
      const res = await apiFetch("/api/director/status");
      const data = await res.json();
      setRecent(Array.isArray(data?.pipelines) ? data.pipelines : []);
    } catch { /* the picker stays empty */ }
  }, []);
  useEffect(() => { loadRecent(); }, [loadRecent]);

  /* A template arrives after mount — apply it once */
  useEffect(() => {
    if (!templateConfig) return;
    const t = templateConfig;
    if (t.concept || t.prompt) setConcept(t.concept || t.prompt);
    if (t.title) setTitle(t.title);
    if (t.type && PRODUCTION_TYPE_PRESETS[t.type]) setType(t.type);
    if (t.platform) setPlatform(t.platform);
    if (t.duration) { chosenDuration.current = true; setDuration(Number(t.duration)); }
    if (t.style) setStyle(t.style);
    if (t.mood) setMood(t.mood);
  }, [templateConfig]);

  /* Duration follows the production type until someone picks one */
  useEffect(() => {
    if (chosenDuration.current) return;
    const preset = PRODUCTION_TYPE_PRESETS[type];
    if (preset?.defaultDuration) setDuration(preset.defaultDuration);
  }, [type]);

  /* ── Status polling ───────────────────────────────────────────────────── */
  const refresh = useCallback(async (id) => {
    if (!id) return null;
    const res = await apiFetch(`/api/director/status?pipelineId=${encodeURIComponent(id)}`, { retries: 0 });
    const data = await res.json();
    const p = data?.pipeline;
    if (!p) return null;

    if (p.status) setPipelineStatus(p.status);
    const planned = p.plan?.shots ? p.plan : p.plan?.plan?.shots ? p.plan.plan : null;
    if (planned) setPlan(planned);
    if (p.costEstimate) setCostEstimate(p.costEstimate);
    if (p.assembledUrl) setAssembledUrl(p.assembledUrl);
    if (Array.isArray(p.shots)) setRunShots(p.shots);
    if (p.brief) {
      if (p.brief.title) setTitle(p.brief.title);
      if (p.brief.concept) setConcept(p.brief.concept);
      if (p.brief.type && PRODUCTION_TYPE_PRESETS[p.brief.type]) setType(p.brief.type);
      if (Array.isArray(p.brief.characters)) {
        setCharacters(p.brief.characters.map((c, i) => ({
          key: `c${i}`,
          name: c?.name || "",
          description: c?.description || "",
          referenceUrl: c?.referenceUrl || null,
        })));
      }
    }
    return p;
  }, []);

  const startPoll = useCallback((id) => {
    stopPoll();
    const tick = async () => {
      try {
        const p = await refresh(id);
        const s = String(p?.status || "").toLowerCase();
        if (DONE.has(s) || FAILED.has(s)) {
          stopPoll();
          onCreditsChanged?.();
          loadBalance();
        }
      } catch { /* transient — the next tick tries again */ }
    };
    pollRef.current = setInterval(tick, 3000);
    tick();
  }, [refresh, stopPoll, onCreditsChanged, loadBalance]);

  /* ── Opened from a project scene ──────────────────────────────────────────
     A scene IS a pipeline, so opening one from Projects deep-links straight
     into its board rather than making the user find it in the picker. The
     poll starts too: a scene opened mid-render should show it moving. */
  useEffect(() => {
    if (!initialPipelineId) return;
    let dead = false;
    setPipelineId(initialPipelineId);
    refresh(initialPipelineId)
      .then((p) => {
        // Poll only while there is something to watch. A scene sitting in
        // "planning" is not moving, and a 3-second poll against a board
        // nobody is running is pure noise.
        const s = String(p?.status || "").toLowerCase();
        if (!dead && !DONE.has(s) && !FAILED.has(s) && s !== "planning" && s !== "draft") {
          startPoll(initialPipelineId);
        }
      })
      .catch(() => { if (!dead) setError("That scene could not be opened."); });
    return () => { dead = true; };
  }, [initialPipelineId, refresh, startPoll]);

  /* ── Build the shot plan ──────────────────────────────────────────────── */
  const buildPlan = useCallback(async () => {
    if (!concept.trim() && !title.trim()) {
      setError("Write a concept or a title before building the plan.");
      return;
    }
    const run = ++seq.current;
    setBusy("plan");
    setError("");
    try {
      const res = await apiFetch("/api/director/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept, title, type, platform, duration, style, mood,
          shots: outline.map((s, i) => ({ index: i, title: s.title, description: s.line })),
          characters: characters
            .filter((c) => c.name.trim() || c.description.trim())
            .map(({ name, description, referenceUrl }) => ({
              name: name.trim(),
              description: description.trim(),
              ...(referenceUrl ? { referenceUrl } : {}),
            })),
        }),
        timeout: 180000,
        retries: 0,
      });
      const data = await res.json();
      if (seq.current !== run) return;

      const read = readPlan(data);
      if (!read.plan) throw new Error("The planner returned no shots. Add more detail to the concept and try again.");

      setPlan(read.plan);
      setCostEstimate(read.costEstimate);
      setPipelineId(read.pipelineId);
      setPipelineStatus("planning");
      setRunShots([]);
      setAssembledUrl(null);
      loadRecent();
    } catch (e) {
      if (seq.current === run) setError(e?.message || "The plan could not be built.");
    } finally {
      if (seq.current === run) setBusy(null);
    }
  }, [concept, title, type, platform, duration, style, mood, outline, characters, loadRecent]);

  /* ── Execute the pipeline ─────────────────────────────────────────────── */
  const execute = useCallback(async () => {
    if (!pipelineId) return;
    const run = ++seq.current;
    setBusy("execute");
    setError("");
    setPipelineStatus("queued");
    startPoll(pipelineId);
    try {
      const res = await apiFetch("/api/director/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: pipelineId }),
        timeout: 1800000,
        retries: 0,
      });
      const data = await res.json();
      if (seq.current !== run) return;

      if (Array.isArray(data?.results)) setRunShots(data.results);
      if (data?.assembledUrl) setAssembledUrl(data.assembledUrl);
      if (data?.success) {
        setPipelineStatus(data.status || "completed");
      } else {
        setPipelineStatus("failed");
        setError(data?.error || "The pipeline stopped before every shot rendered.");
      }
    } catch (e) {
      if (seq.current !== run) return;
      setPipelineStatus("failed");
      setError(e?.message || "The pipeline could not be started.");
    } finally {
      if (seq.current === run) {
        setBusy(null);
        stopPoll();
        onCreditsChanged?.();
        loadBalance();
      }
    }
  }, [pipelineId, startPoll, stopPoll, onCreditsChanged, loadBalance]);

  /* ── Re-run one shot ──────────────────────────────────────────────────── */
  const rerun = useCallback(async (shotId, rerunType) => {
    if (!pipelineId || !shotId) return;
    setRerunning(`${shotId}:${rerunType}`);
    setError("");
    try {
      const res = await apiFetch("/api/director/rerun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: pipelineId, shotId, rerunType }),
        timeout: 1800000,
        retries: 0,
      });
      const data = await res.json();
      const result = data?.result;
      if (result) {
        setRunShots((prev) => {
          const next = prev.slice();
          const at = next.findIndex((r) => (r.shotId || r.id) === shotId);
          const merged = { ...(at >= 0 ? next[at] : { shotId }), ...result, status: "completed", success: true };
          if (at >= 0) next[at] = merged; else next.push(merged);
          return next;
        });
      }
      refresh(pipelineId).catch(() => {});
      onCreditsChanged?.();
      loadBalance();
    } catch (e) {
      setError(e?.message || `Shot ${shotId} could not be re-run.`);
    } finally {
      setRerunning(null);
    }
  }, [pipelineId, refresh, onCreditsChanged, loadBalance]);

  /* ── Generate a single asset for a planned shot (E4.2) ────────────────── */
  const generateAsset = useCallback(async (shotId, kind) => {
    if (!pipelineId || !shotId) return;
    setRerunning(`${shotId}:gen-${kind}`);
    setError("");
    try {
      await apiFetch("/api/director/generate-shot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: pipelineId, shotId, kind }),
        timeout: 1800000,
        retries: 0,
      });
      /* The status route reads the DirectorShot rows the executor just
         wrote — one refresh renders the new asset on the card. */
      await refresh(pipelineId).catch(() => {});
      onCreditsChanged?.();
      loadBalance();
    } catch (e) {
      setError(e?.message || `The shot's ${kind} could not be generated.`);
    } finally {
      setRerunning(null);
    }
  }, [pipelineId, refresh, onCreditsChanged, loadBalance]);

  /* ── Edit the plan's shots (E4.2) — every mutation goes through PATCH,
        so the cost on screen is always the server's recomputed number. ──── */
  const patchShots = useCallback(async (nextShots) => {
    if (!pipelineId) return false;
    setSavingPlan(true);
    setError("");
    try {
      const res = await apiFetch(`/api/director/plan/${encodeURIComponent(pipelineId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: { shots: nextShots } }),
        retries: 0,
      });
      const data = await res.json();
      if (data?.plan) setPlan(data.plan);
      if (data?.costEstimate) setCostEstimate(data.costEstimate);
      return true;
    } catch (e) {
      setError(e?.message || "The shot edit could not be saved.");
      return false;
    } finally {
      setSavingPlan(false);
    }
  }, [pipelineId]);

  const newShotId = () => `shot_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  const saveShot = useCallback(async (draft) => {
    const shots = (plan?.shots || []).map((s) => (s.id === draft.id ? draft : s));
    const ok = await patchShots(shots);
    if (ok) setEditingKey(null);
  }, [plan, patchShots]);

  const duplicateShot = useCallback((shotId) => {
    const shots = plan?.shots || [];
    const at = shots.findIndex((s) => s.id === shotId);
    if (at < 0) return;
    const copy = { ...JSON.parse(JSON.stringify(shots[at])), id: newShotId() };
    const next = [...shots.slice(0, at + 1), copy, ...shots.slice(at + 1)];
    patchShots(next);
  }, [plan, patchShots]);

  const deleteShot = useCallback((shotId) => {
    const shots = plan?.shots || [];
    if (shots.length <= 1) return;
    patchShots(shots.filter((s) => s.id !== shotId));
  }, [plan, patchShots]);

  const moveShot = useCallback((shotId, dir) => {
    const shots = [...(plan?.shots || [])];
    const at = shots.findIndex((s) => s.id === shotId);
    const to = at + dir;
    if (at < 0 || to < 0 || to >= shots.length) return;
    [shots[at], shots[to]] = [shots[to], shots[at]];
    patchShots(shots);
  }, [plan, patchShots]);

  const appendShot = useCallback(() => {
    const shots = plan?.shots || [];
    patchShots([
      ...shots,
      {
        id: newShotId(),
        index: shots.length,
        title: `Shot ${shots.length + 1}`,
        durationSec: 5,
        section: "verse",
        narrativeRole: "",
        sceneGoal: "",
        subjects: [],
        environment: "",
        spatialSetup: "",
        lighting: "",
        mood: "",
        camera: { framing: "medium shot", angle: "eye-level", lens: "35mm", movement: "static", intensity: "subtle" },
        imageStrategy: { mode: "generate", prompt: "", references: [] },
        videoStrategy: { mode: "t2v", prompt: "", keyframes: [], windows: [] },
        audio: null,
        transition: "cut",
        dialogue: null,
        audioCues: null,
        continuity: [],
      },
    ]);
  }, [plan, patchShots]);

  /* ── Load an earlier production ───────────────────────────────────────── */
  const load = useCallback(async (id) => {
    if (!id) return;
    setBusy("plan");
    setError("");
    setSettingsOpen(false);
    try {
      const p = await refresh(id);
      if (!p) throw new Error("That production is no longer available.");
      setPipelineId(id);
      const s = String(p.status || "").toLowerCase();
      if (WORKING.has(s) || s === "queued") startPoll(id);
    } catch (e) {
      setError(e?.message || "That production could not be opened.");
    } finally {
      setBusy(null);
    }
  }, [refresh, startPoll]);

  const reset = useCallback(() => {
    seq.current += 1;
    stopPoll();
    setPlan(null);
    setCostEstimate(null);
    setPipelineId(null);
    setPipelineStatus(null);
    setRunShots([]);
    setAssembledUrl(null);
    setOutline([]);
    setError("");
    setBusy(null);
    setActive(null);
  }, [stopPoll]);

  /* ── Outline editing (pre-plan shots, sent as `shots`) ────────────────── */
  const addShot = () => setOutline((prev) => [...prev, { id: `o${Date.now()}${prev.length}`, title: "", line: "" }]);
  const editShot = (id, patch) => setOutline((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const dropShot = (id) => setOutline((prev) => prev.filter((s) => s.id !== id));

  /* ── The board ────────────────────────────────────────────────────────── */
  const runIndex = useMemo(() => {
    const map = new Map();
    runShots.forEach((entry, i) => {
      const r = readRun(entry);
      if (!r) return;
      if (r.id) map.set(r.id, r);
      map.set(`#${r.index ?? i}`, r);
    });
    return map;
  }, [runShots]);

  const cards = useMemo(() => {
    const shots = plan?.shots || [];
    return shots.map((shot, i) => {
      const run = runIndex.get(shot.id) || runIndex.get(`#${shot.index ?? i}`) || null;
      const shotCost =
        costEstimate?.shotCosts?.find((c) => c.shotId === shot.id)?.total ??
        costEstimate?.shotCosts?.[i]?.total ?? null;
      return {
        key: shot.id || `shot-${i}`,
        id: shot.id || null,
        no: i + 1,
        title: shot.title || `Shot ${i + 1}`,
        section: shot.section || "shot",
        durationSec: shot.durationSec ?? null,
        line: shot.videoStrategy?.prompt || shot.sceneGoal || shot.narrativeRole || shot.environment || "",
        camera: [shot.camera?.framing, shot.camera?.lens, shot.camera?.movement].filter(Boolean).join(" · "),
        continuity: (shot.continuity || []).join(", ") || shot.continuityTracker?.previousEndingFrame || "",
        status: run?.status || (pipelineStatus === "planning" || !pipelineStatus ? "draft" : "queued"),
        imageUrl: run?.imageUrl || null,
        videoUrl: run?.videoUrl || null,
        hasOutputs: !!(run?.imageUrl || run?.videoUrl),
        error: run?.error || null,
        cost: shotCost,
      };
    });
  }, [plan, runIndex, costEstimate, pipelineStatus]);

  /* E4.4: completed shot clips, in plan order — the timeline's raw material. */
  const timelineClips = useMemo(() => {
    const shots = plan?.shots || [];
    return shots
      .map((shot, i) => {
        const run = runIndex.get(shot.id) || runIndex.get(`#${shot.index ?? i}`) || null;
        if (!run?.videoUrl) return null;
        return {
          shotId: shot.id,
          title: shot.title || `Shot ${i + 1}`,
          url: run.videoUrl,
          durationSec: shot.durationSec ?? null,
          transition: shot.transition || "cut",
        };
      })
      .filter(Boolean);
  }, [plan, runIndex]);

  const totalCost = costEstimate?.totalCredits ?? null;
  const totalDuration = useMemo(() => {
    const shots = plan?.shots || [];
    if (shots.length) return shots.reduce((sum, s) => sum + (Number(s.durationSec) || 0), 0);
    return 0;
  }, [plan]);
  const completed = cards.filter((c) => DONE.has(String(c.status).toLowerCase())).length;

  const affordable = balance == null || totalCost == null || totalCost <= balance;
  const shortfall = balance == null || totalCost == null ? 0 : Math.max(0, totalCost - balance);

  const status = String(pipelineStatus || "").toLowerCase();
  const running = busy === "execute" || WORKING.has(status) || status === "queued";
  const finished = DONE.has(status) && !!plan;

  /* Planned shots are editable until the pipeline runs or completes —
     the PATCH route enforces the same rule server-side (409). */
  const canEdit = !!plan && !!pipelineId && !running && !finished;

  const phase = !plan ? "brief" : finished ? "done" : running ? "running" : "plan";

  const primary = {
    brief: { text: busy === "plan" ? "Planning" : "Build shot plan", run: buildPlan },
    plan: { text: "Execute production", run: execute },
    running: { text: label(pipelineStatus) || "Working", run: null },
    done: { text: "New production", run: reset },
  }[phase];

  const meterCost = phase === "brief" ? 0 : totalCost || 0;
  const meterLabel = phase === "done" ? "Spent" : phase === "brief" ? "Estimate" : "Production";

  const disabled =
    !!busy ||
    (phase === "brief" && !concept.trim() && !title.trim()) ||
    (phase === "plan" && (!pipelineId || !affordable));

  const onBriefKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && primary.run && !disabled) {
      e.preventDefault();
      primary.run();
    }
  };

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div className="st-board">
      <header className="st-board__head">
        <div style={{ minWidth: 0 }}>
          <span className="hs-eyebrow">Director</span>
          <h2 className="st-board__title">{title.trim() || plan?.conceptSummary?.slice(0, 48) || "Untitled production"}</h2>
        </div>

        {pipelineStatus && (
          <span className={`hs-badge${finished ? " hs-badge--signal" : FAILED.has(status) ? " hs-badge--fault" : running ? " hs-badge--caution" : ""}`}>
            {label(pipelineStatus)}
          </span>
        )}

        <div className="st-board__stats" style={{ marginLeft: "auto" }}>
          <span>Shots <b>{cards.length || outline.length || 0}</b></span>
          <span>Runtime <b>{clock(totalDuration || (plan ? 0 : duration))}</b></span>
          <span>Cost <b>{credits(totalCost)}</b></span>
          {(running || finished) && <span>Rendered <b>{completed}/{cards.length}</b></span>}
        </div>

        {assembledUrl && (
          <a className="hs-btn hs-btn--sm" href={assembledUrl} target="_blank" rel="noopener noreferrer">
            <IcExternal className="hs-icon-sm" /> Open the film
          </a>
        )}

        <button type="button" className="hs-btn hs-btn--sm" onClick={() => setSettingsOpen(true)}>
          <IcSettings className="hs-icon-sm" /> Production
        </button>
      </header>

      <div className="st-board__strip" aria-label="Shot board">
        {/* Planned shots — order is the film, so the slate number is earned */}
        {cards.map((card) => (
          <article
            key={card.key}
            className={`st-shot${active === card.key ? " is-active" : ""}`}
            onFocus={() => setActive(card.key)}
            onMouseEnter={() => setActive(card.key)}
          >
            <span className={`st-shot__state ${railClass(card.status)}`} aria-hidden="true" />

            <header className="st-shot__slate">
              <span className="st-shot__no">{String(card.no).padStart(2, "0")}</span>
              <span>{label(card.section)}</span>
              <span className="st-shot__dur">{card.durationSec != null ? `${card.durationSec}s` : "—"}</span>
            </header>

            {canEdit && card.id && (
              <div className="st-shot__tools" role="toolbar" aria-label={`Edit shot ${card.no}`}>
                <button
                  type="button"
                  className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip"
                  data-tip="Edit this shot"
                  aria-label={`Edit shot ${card.no}`}
                  onClick={() => setEditingKey(card.id)}
                  disabled={savingPlan}
                >
                  <IcBrush className="hs-icon-sm" />
                </button>
                <button
                  type="button"
                  className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip"
                  data-tip="Duplicate this shot"
                  aria-label={`Duplicate shot ${card.no}`}
                  onClick={() => duplicateShot(card.id)}
                  disabled={savingPlan}
                >
                  <IcCopy className="hs-icon-sm" />
                </button>
                <button
                  type="button"
                  className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip"
                  data-tip="Move earlier"
                  aria-label={`Move shot ${card.no} earlier`}
                  onClick={() => moveShot(card.id, -1)}
                  disabled={savingPlan || card.no === 1}
                >
                  <IcChevronLeft className="hs-icon-sm" />
                </button>
                <button
                  type="button"
                  className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip"
                  data-tip="Move later"
                  aria-label={`Move shot ${card.no} later`}
                  onClick={() => moveShot(card.id, 1)}
                  disabled={savingPlan || card.no === cards.length}
                >
                  <IcChevronRight className="hs-icon-sm" />
                </button>
                <button
                  type="button"
                  className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip"
                  data-tip="Delete this shot"
                  aria-label={`Delete shot ${card.no}`}
                  onClick={() => deleteShot(card.id)}
                  disabled={savingPlan || cards.length === 1}
                >
                  <IcTrash className="hs-icon-sm" />
                </button>
              </div>
            )}

            <div className={`st-shot__frame${card.videoUrl || card.imageUrl ? "" : " is-empty"}`}>
              {card.videoUrl ? (
                <video src={card.videoUrl} muted playsInline loop preload="metadata" />
              ) : card.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- next/image would change loading/layout behavior; deferred, out of scope for lint-only stabilization (2026-08-01)
                <img src={card.imageUrl} alt={`Shot ${card.no}`} />
              ) : (
                <IcFilm style={{ width: 22, height: 22 }} />
              )}
            </div>

            <div className="st-shot__body">
              <strong style={{ fontSize: "var(--t-sm)", fontWeight: 600 }}>{card.title}</strong>
              {card.line && <p className="st-shot__line">{card.line}</p>}
              {card.camera && <span className="hs-hint">{card.camera}</span>}
              {card.continuity && <span className="hs-hint">Continuity: {card.continuity}</span>}
              {card.error && <span className="hs-error">{card.error}</span>}
            </div>

            <footer className="st-shot__foot">
              <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-mute)" }}>
                {label(card.status)}
              </span>
              <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-dim)", marginLeft: "auto" }}>
                {card.cost != null ? `${credits(card.cost)} cr` : "—"}
              </span>

              {pipelineId && card.id && card.hasOutputs && (
                <>
                  <button
                    type="button"
                    className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip"
                    data-tip="Re-run the still"
                    aria-label={`Re-run the still for shot ${card.no}`}
                    onClick={() => rerun(card.id, "image")}
                    disabled={!!rerunning || running}
                  >
                    {rerunning === `${card.id}:image` ? <span className="hs-spin" /> : <IcImage className="hs-icon-sm" />}
                  </button>
                  <button
                    type="button"
                    className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip"
                    data-tip="Re-run the motion"
                    aria-label={`Re-run the motion for shot ${card.no}`}
                    onClick={() => rerun(card.id, "video")}
                    disabled={!!rerunning || running}
                  >
                    {rerunning === `${card.id}:video` ? <span className="hs-spin" /> : <IcVideo className="hs-icon-sm" />}
                  </button>
                  <button
                    type="button"
                    className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip"
                    data-tip="Re-run the whole shot"
                    aria-label={`Re-run shot ${card.no}`}
                    onClick={() => rerun(card.id, "full")}
                    disabled={!!rerunning || running}
                  >
                    {rerunning === `${card.id}:full` ? <span className="hs-spin" /> : <IcRefresh className="hs-icon-sm" />}
                  </button>
                </>
              )}

              {/* E4.2: per-shot generation BEFORE any full run — try one
                  still or one clip without committing to the whole film.
                  Debits exactly this shot's quoted cost server-side. */}
              {pipelineId && card.id && !card.hasOutputs && canEdit && (
                <>
                  <button
                    type="button"
                    className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip"
                    data-tip="Generate the still"
                    aria-label={`Generate the still for shot ${card.no}`}
                    onClick={() => generateAsset(card.id, "image")}
                    disabled={!!rerunning || savingPlan}
                  >
                    {rerunning === `${card.id}:gen-image` ? <span className="hs-spin" /> : <IcImage className="hs-icon-sm" />}
                  </button>
                  <button
                    type="button"
                    className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip"
                    data-tip="Generate the motion"
                    aria-label={`Generate the motion for shot ${card.no}`}
                    onClick={() => generateAsset(card.id, "video")}
                    disabled={!!rerunning || savingPlan}
                  >
                    {rerunning === `${card.id}:gen-video` ? <span className="hs-spin" /> : <IcVideo className="hs-icon-sm" />}
                  </button>
                </>
              )}
            </footer>
          </article>
        ))}

        {/* Sketched shots — sent to the planner as `shots` */}
        {!plan && outline.map((shot, i) => (
          <article key={shot.id} className="st-shot">
            <span className="st-shot__state is-queued" aria-hidden="true" />
            <header className="st-shot__slate">
              <span className="st-shot__no">{String(i + 1).padStart(2, "0")}</span>
              <span>sketch</span>
              <button
                type="button"
                className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon"
                style={{ marginLeft: "auto" }}
                onClick={() => dropShot(shot.id)}
                aria-label={`Remove shot ${i + 1}`}
              >
                <IcClose className="hs-icon-sm" />
              </button>
            </header>

            <div className="st-shot__frame is-empty"><IcFilm style={{ width: 22, height: 22 }} /></div>

            <div className="st-shot__body">
              <input
                className="hs-input"
                value={shot.title}
                onChange={(e) => editShot(shot.id, { title: e.target.value })}
                placeholder={`Shot ${i + 1}`}
                aria-label={`Title for shot ${i + 1}`}
              />
              <textarea
                className="hs-input hs-textarea"
                style={{ minHeight: 64 }}
                value={shot.line}
                onChange={(e) => editShot(shot.id, { line: e.target.value })}
                placeholder="What happens in this shot"
                aria-label={`Description for shot ${i + 1}`}
              />
            </div>
          </article>
        ))}

        {/* Add a shot to the outline. Once a plan exists the planner owns the
            sequence, so the affordance goes away rather than lying. */}
        {!plan && (
          <button type="button" className="st-shot st-shot--add" onClick={addShot}>
            <IcPlus />
            <span style={{ fontSize: "var(--t-tiny)" }}>Add a shot</span>
          </button>
        )}

        {/* E4.2: a planned film can grow too — appends a template shot and
            re-quotes through the PATCH route. */}
        {canEdit && (
          <button type="button" className="st-shot st-shot--add" onClick={appendShot} disabled={savingPlan}>
            <IcPlus />
            <span style={{ fontSize: "var(--t-tiny)" }}>Add a shot</span>
          </button>
        )}

        {!plan && outline.length === 0 && (
          <div style={{ alignSelf: "center", maxWidth: 300, display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
            <p className="hs-hint" style={{ lineHeight: 1.6 }}>
              Write the concept below and build the plan, or sketch the shots yourself first.
              Start from one of these:
            </p>
            <div className="hs-chips">
              {STARTERS.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  className="hs-chip"
                  onClick={() => { setTitle(s.title); setConcept(s.concept); }}
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* E4.4: once the film is rendered, the cut becomes editable. */}
      {finished && timelineClips.length > 0 && (
        <Timeline
          pipelineId={pipelineId}
          clips={timelineClips}
          onAssembled={(url) => setAssembledUrl(url)}
          onRegenerate={(shotId) => rerun(shotId, "video")}
          regenerating={rerunning}
        />
      )}

      <div className="st-board__foot">
        {error && (
          <p className="hs-notice hs-notice--fault" style={{ marginBottom: "var(--s-3)" }} role="alert">
            {error}
          </p>
        )}

        <div className="st-brief">
          <textarea
            value={concept}
            onChange={(e) => setConcept(e.target.value.slice(0, 2000))}
            onKeyDown={onBriefKey}
            rows={2}
            placeholder="Describe the film. Subject, setting, light, and how it should move."
            aria-label="Production concept"
            disabled={phase === "running"}
          />
          <div className="st-brief__foot">
            <div className="st-brief__tools">
              <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={() => setSettingsOpen(true)}>
                <IcSettings className="hs-icon-sm" />
                {(PRODUCTION_TYPE_PRESETS[type]?.label || type)} · {duration}s
              </button>
              {plan && phase !== "running" && (
                <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={buildPlan} disabled={!!busy}>
                  <IcRefresh className="hs-icon-sm" /> Re-plan
                </button>
              )}
            </div>
            <span className="st-brief__count">{concept.length}/2000</span>
          </div>
        </div>

        <div className="st-spend">
          <SpendMeter
            cost={meterCost}
            balance={balance}
            affordable={affordable}
            shortfall={shortfall}
            label={meterLabel}
          />
          <button
            type="button"
            className="hs-btn hs-btn--primary hs-btn--lg"
            onClick={() => primary.run?.()}
            disabled={disabled || !primary.run}
            title={
              phase === "brief" ? "Build the shot plan (Ctrl+Enter)"
              : phase === "plan" ? (affordable ? "Render every shot" : "Not enough credits for this plan")
              : undefined
            }
          >
            {busy || phase === "running" ? <span className="hs-spin" /> : <IcBolt className="hs-icon-sm" />}
            {primary.text}
            {phase === "plan" && totalCost != null && <span className="hs-btn__cost">{totalCost}</span>}
          </button>
        </div>
      </div>

      <ShotEditor
        open={!!editingKey}
        shot={plan?.shots?.find((s) => s.id === editingKey) || null}
        shotNumber={(plan?.shots?.findIndex((s) => s.id === editingKey) ?? -1) + 1 || null}
        onClose={() => setEditingKey(null)}
        onSave={saveShot}
        saving={savingPlan}
      />

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Production">
        <div className="hs-stack">
          <Field label="Title">
            {(id) => (
              <input
                id={id}
                className="hs-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Midnight drive"
              />
            )}
          </Field>

          <Field label="Type" hint="Sets the shot structure and the default models.">
            <Chips options={TYPES} value={type} onChange={setType} scroll />
          </Field>

          <Field label="Platform">
            <Chips options={PLATFORMS} value={platform} onChange={setPlatform} scroll />
          </Field>

          <Field label="Target duration" hint="The planner divides this into 3–8 second shots.">
            <Chips
              options={DURATIONS}
              value={duration}
              onChange={(v) => { chosenDuration.current = true; setDuration(Number(v)); }}
              scroll
            />
          </Field>

          <Field label="Visual style">
            {(id) => (
              <input
                id={id}
                className="hs-input"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="Anamorphic, high contrast, film grain"
              />
            )}
          </Field>

          <Field label="Mood">
            {(id) => (
              <input
                id={id}
                className="hs-input"
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                placeholder="Restless, cold, hopeful at the end"
              />
            )}
          </Field>

          <Field
            label="Characters"
            hint="Name your cast, describe them, and add a reference image if you have one — the director keeps each character consistent across shots."
          >
            <div className="hs-stack" style={{ gap: "var(--s-3)" }}>
              {characters.map((c, i) => (
                <div key={c.key} className="st-character">
                  <div style={{ display: "flex", gap: "var(--s-2)" }}>
                    <input
                      className="hs-input"
                      value={c.name}
                      onChange={(e) => setCharacters((prev) => prev.map((x) => (x.key === c.key ? { ...x, name: e.target.value } : x)))}
                      placeholder="Name"
                      aria-label={`Character ${i + 1} name`}
                    />
                    <button
                      type="button"
                      className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon"
                      onClick={() => setCharacters((prev) => prev.filter((x) => x.key !== c.key))}
                      aria-label={`Remove character ${i + 1}`}
                    >
                      <IcClose className="hs-icon-sm" />
                    </button>
                  </div>
                  <textarea
                    className="hs-input hs-textarea"
                    style={{ minHeight: 48 }}
                    value={c.description}
                    onChange={(e) => setCharacters((prev) => prev.map((x) => (x.key === c.key ? { ...x, description: e.target.value } : x)))}
                    placeholder="Physical description — build, hair, outfit"
                    aria-label={`Character ${i + 1} description`}
                  />
                  <Dropzone
                    value={c.referenceUrl ? { url: c.referenceUrl, name: c.name || "Reference" } : null}
                    onChange={(f) => setCharacters((prev) => prev.map((x) => (x.key === c.key ? { ...x, referenceUrl: f?.url || null } : x)))}
                    accept="image/*"
                    label="Reference image (optional)"
                  />
                </div>
              ))}
              <button
                type="button"
                className="hs-btn hs-btn--sm"
                onClick={() => setCharacters((prev) => [...prev, { key: `c${Date.now()}${prev.length}`, name: "", description: "", referenceUrl: null }])}
              >
                <IcPlus className="hs-icon-sm" /> Add character
              </button>
            </div>
          </Field>

          {recent.length > 0 && (
            <Field label="Earlier productions">
              <div className="hs-stack" style={{ gap: "var(--s-2)" }}>
                {recent.slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="hs-btn hs-btn--sm hs-btn--block"
                    onClick={() => load(p.id)}
                    style={{ justifyContent: "space-between" }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.title || p.name || p.id}
                    </span>
                    <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-mute)" }}>
                      {label(p.status) || "saved"}
                    </span>
                  </button>
                ))}
              </div>
            </Field>
          )}
        </div>
      </Sheet>
    </div>
  );
}
