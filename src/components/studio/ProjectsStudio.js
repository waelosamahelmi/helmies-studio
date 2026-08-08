"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/client-fetch";
import ErrorState from "@/components/states/ErrorState";
import { useModelCatalog } from "@/components/studio/useModelCatalog";
import {
  imageModelsFor, videoModelsFor, voiceModelsFor, estimateProjectCost, pickTextToImageModel,
} from "@/lib/project-models.mjs";
import {
  Confirm, Modal, Field, Segmented, ModelPicker,
  useGridRoving, LibrarySearch, LibrarySkeleton,
  IcLayers, IcPlus, IcTrash, IcCheck, IcClose, IcChevronLeft,
  IcFilm, IcPersona, IcPalette, IcImage, IcArchive, IcSpark, IcPlay,
  IcVideo, IcMegaphone,
} from "@/components/studio/kit";

/* ══════════════════════════════════════════════════════════════════════════
   PROJECTS — the spine
   ──────────────────────────────────────────────────────────────────────────
   A project is what a production actually is: a type, a scenario, one format
   every shot inherits, and the cast, places and scenes that belong to it.
   Before this, "Projects" in the rail opened project memory — a different
   thing with the same name — and the format had to be re-typed into every
   generation, which is how a vertical film ended up with landscape shots.

   A SCENE IS A PIPELINE. Director is not a separate destination any more:
   it is the board a scene opens into, and the DirectorPipeline row it
   already used is the scene record. That is why adding a scene here needs
   only "what happens" — the type, the aspect ratio and the cast come off
   the project.
   ══════════════════════════════════════════════════════════════════════════ */

const ASPECTS = ["9:16", "16:9", "1:1", "4:5", "2.39:1", "21:9"];
const RESOLUTIONS = ["480p", "720p", "1080p", "4k"];

const KIND_ICON = { movie: IcFilm, series: IcFilm, social: IcVideo, ad: IcMegaphone, branding: IcPalette };

const MEMBER_GROUPS = [
  { key: "cast", kind: "character", label: "Cast", one: "character", icon: IcPersona,
    empty: "The people this production has to keep consistent." },
  { key: "environments", kind: "environment", label: "Places", one: "environment", icon: IcPalette,
    empty: "The rooms and locations your scenes return to." },
  { key: "products", kind: "product", label: "Props", one: "product", icon: IcImage,
    empty: "Objects that must survive the shoot unchanged." },
];

const SCENE_STATUS = {
  planning: "Planned",
  draft: "Draft",
  executing: "Rendering",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

function dateLabel(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

/* ══════════════════════════════════════════════════════════════════════ */
export default function ProjectsStudio() {
  const [projects, setProjects] = useState([]);
  const [kinds, setKinds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [reloads, setReloads] = useState(0);

  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [doomed, setDoomed] = useState(null);

  const { gridRef, onGridKey } = useGridRoving();
  const reload = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await apiFetch("/api/projects");
        const data = await res.json();
        if (cancelled) return;
        setProjects(Array.isArray(data.projects) ? data.projects : []);
        setKinds(Array.isArray(data.kinds) ? data.kinds : []);
      } catch (e) {
        if (!cancelled) { setError(e?.message || "Your projects could not be loaded."); setProjects([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloads]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      `${p.name} ${p.description || ""} ${p.brief || ""}`.toLowerCase().includes(q));
  }, [projects, query]);

  const remove = useCallback(async (project) => {
    setError("");
    try {
      await apiFetch(`/api/projects/${project.id}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      setOpenId((cur) => (cur === project.id ? null : cur));
      setNotice(`${project.name} was deleted. Its cast and assets were kept.`);
    } catch (e) {
      setError(e?.message || "That project could not be deleted.");
    }
  }, []);

  if (openId) {
    return (
      <ProjectDetail
        id={openId}
        kinds={kinds}
        onBack={() => setOpenId(null)}
        onChanged={(project) => setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, ...project } : p)))}
        onDeleted={(project) => { setOpenId(null); remove(project); }}
      />
    );
  }

  return (
    <div className="st-lib">
      <div className="st-lib__bar">
        <LibrarySearch
          value={query}
          onChange={setQuery}
          placeholder="Search projects and scenarios"
          label="Search projects"
        />
        <span className="hs-mono hs-mute" style={{ fontSize: 10, letterSpacing: "0.06em" }}>
          {loading ? "—" : `${shown.length} project${shown.length === 1 ? "" : "s"}`}
        </span>
        <button type="button" className="hs-btn hs-btn--primary hs-btn--sm" style={{ marginLeft: "auto" }}
          onClick={() => setCreating(true)}>
          <IcPlus className="hs-icon-sm" /> New project
        </button>
      </div>

      <div className="st-lib__body">
        {notice && (
          <div className="hs-notice hs-notice--signal" style={{ marginBottom: "var(--s-4)" }} role="status">
            <IcCheck className="hs-icon-sm" style={{ marginTop: 2 }} />
            <span style={{ flex: 1 }}>{notice}</span>
          </div>
        )}

        {loading ? (
          <LibrarySkeleton count={6} label="Loading projects" />
        ) : error && !shown.length ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !shown.length ? (
          <div className="hs-empty">
            <span className="hs-empty__mark"><IcLayers /></span>
            {query.trim() ? (
              <>
                <h3>Nothing matches that search</h3>
                <p>Search covers the name, the description and the scenario.</p>
                <button type="button" className="hs-btn hs-btn--outline" onClick={() => setQuery("")}>
                  <IcClose className="hs-icon-sm" /> Clear search
                </button>
              </>
            ) : (
              <>
                <h3>No projects yet</h3>
                <p>
                  A project holds the scenario, the format every shot inherits, and the cast and
                  places that have to look the same across all of them.
                </p>
                <button type="button" className="hs-btn hs-btn--primary" onClick={() => setCreating(true)}>
                  <IcPlus className="hs-icon-sm" /> Start a project
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="st-lib__grid" ref={gridRef} role="list" aria-label="Projects" onKeyDown={onGridKey}>
            {shown.map((p) => {
              const s = p.data || {};
              const kind = kinds.find((k) => k.value === s.kind) || kinds[0];
              const Icon = KIND_ICON[s.kind] || IcLayers;
              return (
                <div key={p.id} className="st-item" role="listitem">
                  <button
                    type="button" data-card onClick={() => setOpenId(p.id)}
                    aria-label={`${p.name} — ${kind?.label || "project"}. Open it.`}
                    style={{
                      display: "block", width: "100%", padding: 0, border: 0,
                      background: "transparent", color: "inherit", font: "inherit",
                      textAlign: "left", cursor: "pointer",
                    }}
                  >
                    <div className="st-item__frame">
                      <span style={{ display: "grid", placeItems: "center", height: "100%" }}>
                        <Icon style={{ width: 28, height: 28, color: "var(--tx-ghost)" }} />
                      </span>
                      <span className="st-item__kind">{kind?.label || "Project"}</span>
                    </div>
                    <div className="st-item__body">
                      <span className="st-item__name">{p.name}</span>
                      <span className="st-item__meta">
                        {[s.aspectRatio, s.resolution, dateLabel(p.updatedAt)].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  </button>
                  <div className="st-item__acts">
                    <button type="button" className="hs-btn hs-btn--sm hs-btn--icon hs-btn--danger"
                      onClick={() => setDoomed(p)} aria-label={`Delete ${p.name}`} title="Delete">
                      <IcTrash className="hs-icon-sm" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <NewProject
        open={creating}
        kinds={kinds}
        onClose={() => setCreating(false)}
        onCreated={(project) => {
          setProjects((prev) => [project, ...prev]);
          setCreating(false);
          setOpenId(project.id);
        }}
      />

      <Confirm
        open={!!doomed}
        onClose={() => setDoomed(null)}
        onConfirm={() => doomed && remove(doomed)}
        title={`Delete ${doomed?.name || "this project"}?`}
        body="The cast, assets and scenes made inside it are kept — they are simply no longer filed here."
        confirmLabel="Delete"
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   NEW PROJECT — type first, because it decides what a scene means
   ══════════════════════════════════════════════════════════════════════ */
function NewProject({ open, kinds, onClose, onCreated }) {
  const [kind, setKind] = useState("movie");
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState("720p");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setKind("movie"); setName(""); setBrief("");
    setAspectRatio("9:16"); setResolution("720p"); setError("");
  }, [open]);

  const submit = useCallback(async () => {
    if (!name.trim()) { setError("Give it a name."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          brief: brief.trim() || null,
          settings: { kind, aspectRatio, resolution },
        }),
      });
      const data = await res.json();
      onCreated?.(data.project);
    } catch (e) {
      setError(e?.message || "That project could not be created.");
    } finally {
      setSaving(false);
    }
  }, [name, brief, kind, aspectRatio, resolution, onCreated]);

  const chosen = kinds.find((k) => k.value === kind);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      footer={
        <>
          <button type="button" className="hs-btn hs-btn--ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="hs-btn hs-btn--primary" onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create project"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
        {error && (
          <div className="hs-notice hs-notice--fault" role="alert">
            <span style={{ flex: 1 }}>{error}</span>
          </div>
        )}

        <Field label="What are you making?" hint={chosen?.blurb}>
          <div className="st-kinds" role="radiogroup" aria-label="Project type">
            {kinds.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={kind === k.value}
                className={`st-kind${kind === k.value ? " is-active" : ""}`}
                onClick={() => setKind(k.value)}
              >
                <span className="st-kind__label">{k.label}</span>
                <span className="st-kind__unit">in {k.unit}s</span>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Name">
          {(id) => (
            <input id={id} className="hs-input" value={name} maxLength={120}
              onChange={(e) => setName(e.target.value)} placeholder="TWO LIVES" />
          )}
        </Field>

        <Field
          label="Scenario"
          hint="Paste the whole thing if you have it. Every scene is written against this, so you never describe the story twice."
        >
          {(id) => (
            <textarea id={id} className="hs-input" rows={7} value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="The story, the treatment, the campaign brief — whatever this production is." />
          )}
        </Field>

        <Field label="Format" hint="Every shot in this project inherits it, so no scene has to be told again.">
          <div className="st-project__format" style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-3)" }}>
            <Segmented label="Aspect ratio" value={aspectRatio} onChange={setAspectRatio}
              options={ASPECTS.map((a) => ({ value: a, label: a }))} />
            <Segmented label="Resolution" value={resolution} onChange={setResolution}
              options={RESOLUTIONS.map((r) => ({ value: r, label: r }))} />
          </div>
        </Field>
      </div>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   PROJECT DETAIL
   ══════════════════════════════════════════════════════════════════════ */
const TABS = [
  { id: "scenes", label: "Scenes" },
  { id: "cast", label: "Cast & places" },
  { id: "assets", label: "Assets" },
  { id: "setup", label: "Scenario & format" },
];

function ProjectDetail({ id, kinds, onBack, onChanged, onDeleted }) {
  const [contents, setContents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("scenes");
  const [reloads, setReloads] = useState(0);
  const [doomed, setDoomed] = useState(false);

  /* The full catalog, filtered per-project below. Fetched once and shared
     with the settings pickers, so the header's cost and the picker's list
     can never disagree about what a model costs. */
  const { models, loading: modelsLoading } = useModelCatalog();

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await apiFetch(`/api/projects/${id}`);
        const data = await res.json();
        if (!cancelled) setContents(data);
      } catch (e) {
        if (!cancelled) setError(e?.message || "That project could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, reloads]);

  const patch = useCallback(async (body, note) => {
    setError("");
    try {
      const res = await apiFetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setContents((prev) => (prev ? { ...prev, project: data.project, settings: { ...prev.settings, ...(data.project.data || {}) } } : prev));
      onChanged?.(data.project);
      if (note) setNotice(note);
      return data.project;
    } catch (e) {
      setError(e?.message || "That change could not be saved.");
      return null;
    }
  }, [id, onChanged]);

  const project = contents?.project;
  const settings = useMemo(() => contents?.settings || {}, [contents]);
  const kind = kinds.find((k) => k.value === settings.kind) || kinds[0];
  const unit = kind?.unit || "scene";

  /* What finishing this costs. Every shot is a still plus a clip, because
     that is how the pipeline runs — approve the frame, then animate it.
     Shots already rendered are not counted again: the useful number is
     what is left to pay for, not what the film would have cost from
     scratch. An estimate, and it says so. */
  const estimate = useMemo(() => {
    const byId = new Map((models || []).map((m) => [m.id, m]));
    return estimateProjectCost(contents?.scenes || [], {
      imageCredits: byId.get(settings.imageModel)?.credits || 0,
      videoCredits: byId.get(settings.videoModel)?.credits || 0,
    });
  }, [models, contents, settings.imageModel, settings.videoModel]);

  if (loading) {
    return (
      <div className="st-sheet">
        <div className="st-lib__bar">
          <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={onBack}>
            <IcChevronLeft className="hs-icon-sm" /> Projects
          </button>
        </div>
        <div className="st-sheet__body"><div className="st-sheet__inner"><LibrarySkeleton count={4} label="Loading project" /></div></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="st-sheet">
        <div className="st-lib__bar">
          <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={onBack}>
            <IcChevronLeft className="hs-icon-sm" /> Projects
          </button>
        </div>
        <div className="st-sheet__body"><div className="st-sheet__inner">
          <ErrorState message={error || "That project could not be found."} onRetry={reload} />
        </div></div>
      </div>
    );
  }

  return (
    <div className="st-sheet">
      <div className="st-lib__bar st-project__bar">
        <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={onBack}>
          <IcChevronLeft className="hs-icon-sm" /> Projects
        </button>
        <strong className="st-project__name">{project.name}</strong>
        <span className="hs-badge">{kind?.label || "Project"}</span>
        <span className="hs-mono hs-mute" style={{ fontSize: 10, letterSpacing: "0.06em" }}>
          {[settings.aspectRatio, settings.resolution].filter(Boolean).join(" · ")}
        </span>
        {estimate.shots > 0 && (
          <span
            className={`hs-badge${estimate.known ? "" : " hs-badge--caution"}`}
            title={
              estimate.known
                ? `${estimate.shots} shots x ${estimate.perShot} cr each (a still plus a clip). ${estimate.remaining} still to render.`
                : "Pick an image and a video model under Scenario & format to see what this costs."
            }
          >
            {estimate.known ? `~${estimate.toFinish} cr to finish` : "cost unknown"}
          </span>
        )}
        <button type="button" className="hs-btn hs-btn--sm hs-btn--icon hs-btn--danger" style={{ marginLeft: "auto" }}
          onClick={() => setDoomed(true)} aria-label={`Delete ${project.name}`} title="Delete project">
          <IcTrash className="hs-icon-sm" />
        </button>
      </div>

      <div className="st-lib__bar st-project__tabs">
        <Segmented label="Section" value={tab} onChange={setTab}
          options={TABS.map((t) => ({ value: t.id, label: t.id === "scenes" ? `${unit[0].toUpperCase()}${unit.slice(1)}s` : t.label }))} />
      </div>

      <div className="st-sheet__body">
        <div className="st-sheet__inner">
          {error && (
            <div className="hs-notice hs-notice--fault" role="alert" style={{ marginBottom: "var(--s-4)" }}>
              <span style={{ flex: 1 }}>{error}</span>
            </div>
          )}
          {notice && !error && (
            <div className="hs-notice hs-notice--signal" role="status" style={{ marginBottom: "var(--s-4)" }}>
              <IcCheck className="hs-icon-sm" style={{ marginTop: 2 }} />
              <span style={{ flex: 1 }}>{notice}</span>
            </div>
          )}

          {tab === "scenes" && (
            <ScenesTab project={project} contents={contents} unit={unit} onChanged={reload} />
          )}
          {tab === "cast" && (
            <MembersTab contents={contents} projectId={id} onChanged={reload} setNotice={setNotice} setError={setError} />
          )}
          {tab === "assets" && <AssetsTab assets={contents.assets || []} />}
          {tab === "setup" && (
            <SetupTab
              project={project} settings={settings} kinds={kinds} onSave={patch}
              models={models} modelsLoading={modelsLoading}
            />
          )}
        </div>
      </div>

      <Confirm
        open={doomed}
        onClose={() => setDoomed(false)}
        onConfirm={() => onDeleted?.(project)}
        title={`Delete ${project.name}?`}
        body="The cast, assets and scenes made inside it are kept — they are simply no longer filed here."
        confirmLabel="Delete"
      />
    </div>
  );
}

/* ── Scenes ─────────────────────────────────────────────────────────────── */
function ScenesTab({ project, contents, unit, onChanged }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [rendering, setRendering] = useState(null);
  const [breaking, setBreaking] = useState(false);
  const [report, setReport] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState("");
  const scenes = contents.scenes || [];

  /* One read of the screenplay produces the whole structure. Planning scene
     by scene re-reads the script each time and lets the same character come
     back described differently — which is exactly how a face drifts.

     The read runs on the server and is polled, not awaited: on a real
     screenplay it takes minutes, and the first version held the request
     open until the proxy cut it at five minutes and the work was lost. */
  const poll = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/projects/${project.id}/breakdown`, { retries: 0 });
      const { breakdown } = await res.json();
      if (!breakdown || breakdown.status === "idle") return true;
      setReport(breakdown);
      if (breakdown.status === "reading") return false;
      setBreaking(false);
      if (breakdown.status === "done") onChanged?.();
      else setError(breakdown.error || "The scenario could not be read.");
      return true;
    } catch {
      return false; // transient — the next tick tries again
    }
  }, [project.id, onChanged]);

  useEffect(() => {
    if (!breaking) return undefined;
    let dead = false;
    const timer = setInterval(async () => {
      const finished = await poll();
      if (finished && !dead) clearInterval(timer);
    }, 5000);
    return () => { dead = true; clearInterval(timer); };
  }, [breaking, poll]);

  // A read already running when the tab was opened must still be watched.
  useEffect(() => {
    let dead = false;
    apiFetch(`/api/projects/${project.id}/breakdown`, { retries: 0 })
      .then((r) => r.json())
      .then(({ breakdown }) => {
        if (dead || !breakdown) return;
        if (breakdown.status === "reading") { setReport(breakdown); setBreaking(true); }
        else if (breakdown.status === "done" || breakdown.status === "failed") setReport(breakdown);
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [project.id]);

  const breakDown = useCallback(async () => {
    setBreaking(true);
    setError("");
    setReport(null);
    try {
      await apiFetch(`/api/projects/${project.id}/breakdown`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ replace: scenes.length > 0 }),
        retries: 0,
      });
    } catch (e) {
      setBreaking(false);
      setError(e?.message || "The scenario could not be broken down.");
    }
  }, [project.id, scenes.length]);

  /* Render a scene without leaving the project. This is the same call
     Director's own button makes — the board is where you go to inspect or
     redo a single shot, not where you have to go to start. */
  const render = useCallback(async (scene) => {
    setRendering(scene.id);
    setError("");
    try {
      await apiFetch("/api/director/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: scene.id }),
        timeout: 900000,
        retries: 0,
      });
      onChanged?.();
    } catch (e) {
      setError(e?.message || `${scene.title} could not be rendered.`);
    } finally {
      setRendering(null);
    }
  }, [onChanged]);

  /* A scene opens into Director's board — the same surface it always was,
     reached by the pipeline id the scene already is. */
  const openScene = useCallback(
    (sceneId) => router.push(`/studio/director?pipeline=${encodeURIComponent(sceneId)}`),
    [router],
  );

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
      <div className="hs-row hs-row--between" style={{ alignItems: "flex-start" }}>
        <div>
          <h3 style={{ fontSize: "var(--t-sm)", fontWeight: 600 }}>
            {scenes.length} {unit}{scenes.length === 1 ? "" : "s"}
          </h3>
          <p className="hs-hint" style={{ marginTop: 2 }}>
            Each one is a shot board. Describe what happens — the format, the type and the cast come from the project.
          </p>
        </div>
        <div className="hs-row" style={{ gap: "var(--s-2)" }}>
          {project.brief && (
            <button type="button" className={`hs-btn hs-btn--sm ${scenes.length ? "hs-btn--outline" : "hs-btn--primary"}`}
              onClick={breakDown} disabled={!!breaking}>
              <IcSpark className="hs-icon-sm" />
              {breaking ? "Reading the script…" : scenes.length ? "Break down again" : "Break the scenario into scenes"}
            </button>
          )}
          <button type="button" className={`hs-btn hs-btn--sm ${scenes.length || !project.brief ? "hs-btn--primary" : "hs-btn--outline"}`}
            onClick={() => setAdding(true)}>
            <IcPlus className="hs-icon-sm" /> Add {unit}
          </button>
        </div>
      </div>

      {breaking && (
        <div className="hs-notice" role="status">
          <span style={{ flex: 1 }}>
            Reading the whole screenplay in one pass — characters, places, and every shot of every {unit}.
            This takes a minute or two on a feature-length script, and spends nothing.
          </span>
        </div>
      )}
      {report?.status === "done" && (
        <div className="hs-notice hs-notice--signal" role="status">
          <IcCheck className="hs-icon-sm" style={{ marginTop: 2 }} />
          <span style={{ flex: 1 }}>
            {report.scenes} {unit}{report.scenes === 1 ? "" : "s"}, {report.shots} shots
            {report.seconds ? `, about ${Math.round(report.seconds / 60)} min` : ""}
            {report.created ? `, ${report.created} new in the cast` : ""}
            {report.reused ? `, ${report.reused} reused` : ""}.
            {report.warnings?.length ? ` Worth checking: ${report.warnings.join(" ")}` : ""}
          </span>
        </div>
      )}
      {(report?.status === "failed" || report?.status === "stalled") && (
        <div className="hs-notice hs-notice--fault" role="alert">
          <span style={{ flex: 1 }}>{report.error}</span>
        </div>
      )}

      {error && (
        <div className="hs-notice hs-notice--fault" role="alert"><span style={{ flex: 1 }}>{error}</span></div>
      )}

      {!scenes.length ? (
        <div className="hs-empty">
          <span className="hs-empty__mark"><IcFilm /></span>
          <h3>No {unit}s yet</h3>
          <p>
            {project.brief
              ? `The scenario is saved. Break it down and every ${unit} in it becomes a shot board — or add one by hand.`
              : `Add the scenario under “Scenario & format” first — every ${unit} is written against it.`}
          </p>
          {project.brief ? (
            <div className="hs-row" style={{ gap: "var(--s-2)", justifyContent: "center" }}>
              <button type="button" className="hs-btn hs-btn--primary" onClick={breakDown} disabled={breaking}>
                <IcSpark className="hs-icon-sm" /> {breaking ? "Reading the script…" : "Break the scenario into scenes"}
              </button>
              <button type="button" className="hs-btn hs-btn--outline" onClick={() => setAdding(true)}>
                <IcPlus className="hs-icon-sm" /> Add one by hand
              </button>
            </div>
          ) : (
            <button type="button" className="hs-btn hs-btn--primary" onClick={() => setAdding(true)}>
              <IcPlus className="hs-icon-sm" /> Add the first {unit}
            </button>
          )}
        </div>
      ) : (
        <ol className="st-scenes">
          {scenes.map((s, i) => {
            const open = expanded === s.id;
            return (
              <li key={s.id} className="st-scene">
                <div className="st-scene__row">
                  <span className="st-scene__no hs-mono">{String(i + 1).padStart(2, "0")}</span>
                  {/* The row opens the shots. Opening the board is a
                      separate, explicit action — the common thing a person
                      wants here is to see what the scene IS. */}
                  <button
                    type="button" className="st-scene__main"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : s.id)}
                  >
                    <span className="st-scene__title">{s.title}</span>
                    <span className="st-scene__meta">
                      {[
                        `${s.shots} shot${s.shots === 1 ? "" : "s"}`,
                        s.rendered ? `${s.rendered} rendered` : null,
                        s.assembledUrl ? "assembled" : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                  <div className="st-scene__acts">
                    <span className={`hs-badge${s.status === "completed" ? " hs-badge--signal" : s.status === "failed" ? " hs-badge--fault" : ""}`}>
                      {SCENE_STATUS[s.status] || s.status}
                    </span>
                    {s.rendered < s.shots && (
                      <button type="button" className="hs-btn hs-btn--sm hs-btn--primary"
                        onClick={() => render(s)} disabled={!!rendering}>
                        {rendering === s.id ? "Rendering…" : s.rendered ? "Finish" : "Render"}
                      </button>
                    )}
                    <button type="button" className="hs-btn hs-btn--sm hs-btn--outline" onClick={() => openScene(s.id)}>
                      <IcPlay className="hs-icon-sm" /> Board
                    </button>
                  </div>
                </div>

                {open && (
                  <ol className="st-shots">
                    {(s.board || []).map((shot, n) => (
                      <li key={shot.id} className="st-shot">
                        <span className="st-shot__frame">
                          {shot.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- consistent with every other studio thumbnail
                            <img src={shot.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-ghost)" }}>
                              {String(n + 1).padStart(2, "0")}
                            </span>
                          )}
                        </span>
                        <div className="st-shot__body">
                          <span className="st-shot__title">{shot.title}</span>
                          <span className="st-shot__meta">
                            {[
                              shot.framing,
                              shot.seconds ? `${shot.seconds}s` : null,
                              shot.subjects?.length ? shot.subjects.join(", ") : null,
                            ].filter(Boolean).join(" · ")}
                          </span>
                          {shot.dialogue && <span className="st-shot__line">“{shot.dialogue}”</span>}
                        </div>
                        {shot.videoUrl && (
                          <a className="hs-btn hs-btn--sm hs-btn--ghost" href={shot.videoUrl} target="_blank" rel="noreferrer">
                            View
                          </a>
                        )}
                      </li>
                    ))}
                    {!(s.board || []).length && (
                      <li className="hs-hint" style={{ padding: "var(--s-2) var(--s-3)" }}>
                        No shots planned yet — open the board to plan them.
                      </li>
                    )}
                  </ol>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {scenes.length > 0 && <CombineBar project={project} unit={unit} />}

      <NewScene
        open={adding}
        projectId={project.id}
        unit={unit}
        cast={contents.cast || []}
        environments={contents.environments || []}
        products={contents.products || []}
        onClose={() => setAdding(false)}
        onCreated={(sceneId) => { setAdding(false); openScene(sceneId); }}
      />
    </section>
  );
}

/* Combining the scenes into one piece. Every scene already assembles its own
   shots; this joins the scenes. It runs ffmpeg over media that is already
   paid for, so it costs nothing and can be redone as often as you like — the
   button says so, because "combine" reads like it might charge. */
function CombineBar({ project, unit }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [transition, setTransition] = useState("cut");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/projects/${project.id}/movie`);
      setState(await res.json());
    } catch { /* the bar simply stays quiet */ }
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  const combine = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`/api/projects/${project.id}/movie`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transition }),
        timeout: 600000,
        retries: 0,
      });
      const data = await res.json();
      setState((prev) => ({ ...(prev || {}), movieUrl: data.url, builtAt: new Date().toISOString() }));
    } catch (e) {
      setError(e?.message || "The scenes could not be joined.");
    } finally {
      setBusy(false);
    }
  }, [project.id, transition]);

  if (!state) return null;

  return (
    <section className="st-combine">
      <div className="hs-row hs-row--between" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: "var(--s-3)" }}>
        <div>
          <h3 style={{ fontSize: "var(--t-sm)", fontWeight: 600 }}>Combine into one piece</h3>
          <p className="hs-hint" style={{ marginTop: 2 }}>
            {state.missing?.length
              ? `Nothing is rendered yet for ${state.missing.join(", ")}.`
              : `${state.clips} clip${state.clips === 1 ? "" : "s"} from ${state.scenes} ${unit}${state.scenes === 1 ? "" : "s"}, joined in order. Costs nothing — it is a cut, not a render.`}
          </p>
        </div>
        <div className="hs-row" style={{ gap: "var(--s-2)" }}>
          <Segmented label="Transition" value={transition} onChange={setTransition}
            options={[
              { value: "cut", label: "Cut" },
              { value: "fade", label: "Fade" },
              { value: "dissolve", label: "Dissolve" },
            ]} />
          <button type="button" className="hs-btn hs-btn--primary hs-btn--sm"
            onClick={combine} disabled={busy || !state.ready}>
            {busy ? "Joining…" : state.movieUrl ? "Rebuild" : "Combine"}
          </button>
        </div>
      </div>

      {error && (
        <div className="hs-notice hs-notice--fault" role="alert" style={{ marginTop: "var(--s-3)" }}>
          <span style={{ flex: 1 }}>{error}</span>
        </div>
      )}

      {state.movieUrl && (
        <div style={{ marginTop: "var(--s-3)" }}>
          <video src={state.movieUrl} controls playsInline
            style={{ width: "100%", maxHeight: 420, borderRadius: "var(--r-md)", background: "#000" }} />
          <div className="hs-row" style={{ marginTop: "var(--s-2)", gap: "var(--s-2)" }}>
            <a className="hs-btn hs-btn--outline hs-btn--sm" href={state.movieUrl} download>
              Download
            </a>
            <span className="hs-hint">Built {dateLabel(state.builtAt) || "just now"}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function NewScene({ open, projectId, unit, cast, environments, products, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [concept, setConcept] = useState("");
  const [duration, setDuration] = useState(30);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const members = useMemo(
    () => [...cast, ...environments, ...products],
    [cast, environments, products],
  );

  useEffect(() => {
    if (!open) return;
    setTitle(""); setConcept(""); setDuration(30); setError("");
    // Everyone filed under the project is in it unless you say otherwise —
    // the common case is a scene using the cast you already built.
    setPicked(cast.map((c) => c.id));
  }, [open, cast]);

  const submit = useCallback(async () => {
    if (!concept.trim()) { setError(`Describe what happens in this ${unit}.`); return; }
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`/api/projects/${projectId}/scenes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          concept: concept.trim(),
          duration: Number(duration) || 30,
          entityIds: picked,
        }),
        timeout: 180000,
        retries: 0,
      });
      const data = await res.json();
      onCreated?.(data.sceneId);
    } catch (e) {
      setError(e?.message || `That ${unit} could not be planned.`);
    } finally {
      setBusy(false);
    }
  }, [projectId, title, concept, duration, picked, unit, onCreated]);

  const toggle = (entityId) =>
    setPicked((prev) => (prev.includes(entityId) ? prev.filter((x) => x !== entityId) : [...prev, entityId]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add a ${unit}`}
      footer={
        <>
          <button type="button" className="hs-btn hs-btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="hs-btn hs-btn--primary" onClick={submit} disabled={busy}>
            {busy ? "Planning…" : "Plan the shots"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
        {error && (
          <div className="hs-notice hs-notice--fault" role="alert"><span style={{ flex: 1 }}>{error}</span></div>
        )}

        <Field label="Title" hint="Optional — it is numbered either way.">
          {(fid) => (
            <input id={fid} className="hs-input" value={title} maxLength={120}
              onChange={(e) => setTitle(e.target.value)} placeholder={`${unit} title`} />
          )}
        </Field>

        <Field label="What happens" hint="Written against the project's scenario, so only this part is needed.">
          {(fid) => (
            <textarea id={fid} className="hs-input" rows={5} value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="He wakes in the same bedroom, but the clock reads a different year." />
          )}
        </Field>

        <Field label="Length" hint="Roughly how long this runs, in seconds. It decides how many shots are planned.">
          {(fid) => (
            <input id={fid} type="number" className="hs-input" min={5} max={600} value={duration}
              onChange={(e) => setDuration(e.target.value)} />
          )}
        </Field>

        {members.length > 0 && (
          <Field label="Who and what is in it" hint="Their reference photographs go to the planner, so the shots are written for faces that already exist.">
            <div className="hs-chips" role="group" aria-label="Cast in this scene">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={picked.includes(m.id)}
                  className={`hs-chip${picked.includes(m.id) ? " is-active" : ""}`}
                  onClick={() => toggle(m.id)}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </Field>
        )}

        <p className="hs-hint">
          Planning writes the shot list and costs nothing. The shots are quoted and paid for when you render them.
        </p>
      </div>
    </Modal>
  );
}

/* ── Cast & places ──────────────────────────────────────────────────────── */
function MembersTab({ contents, projectId, onChanged, setNotice, setError }) {
  const [available, setAvailable] = useState([]);
  const [picking, setPicking] = useState(null); // a MEMBER_GROUPS entry
  const [busy, setBusy] = useState(false);
  const [coverage, setCoverage] = useState(null);
  const [making, setMaking] = useState(null); // entity id currently rendering
  const { models } = useModelCatalog();

  /* What is still missing, for everything filed here. Breaking a screenplay
     down creates every place it names as a description with no
     photographs; finding each one in the Cast studio and filling it in by
     hand is a chore nobody should be given eleven times. */
  const loadCoverage = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/projects/${projectId}/coverage`, { retries: 0 });
      setCoverage(await res.json());
    } catch { /* the rows still render without it */ }
  }, [projectId]);

  useEffect(() => { loadCoverage(); }, [loadCoverage, contents]);

  const gapFor = useCallback(
    (entityId) => (coverage?.entities || []).find((e) => e.id === entityId) || null,
    [coverage],
  );

  /* Generating the views, from here.

     One view at a time and in order: the anchor has to EXIST before the
     rest, because they are generated as references to it. Firing them
     together with nothing on file would produce five unrelated rooms. */
  const makeViews = useCallback(async (entity) => {
    const gap = gapFor(entity.id);
    if (!gap?.missing?.length) return;

    /* The project's own image model first, and only a model whose schema
       PROVES it makes a still. An earlier version treated an absent schema
       as safe and then ranked by price descending — which is how a
       text-to-video model was picked to draw a bedroom. */
    const scratchModel = pickTextToImageModel(models, {
      preferred: coverage?.settings?.imageModel,
      aspectRatio: coverage?.settings?.aspectRatio,
    });
    if (!scratchModel) { setError?.("No model here can draw a view from a description."); return; }

    setMaking(entity.id);
    setError?.("");
    try {
      const anchor = gap.missing[0];
      const res = await apiFetch("/api/generate/async", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tool: "image",
          model: scratchModel.id,
          prompt: [entity.description, anchor.prompt].filter(Boolean).join(". "),
          expand: false,
          aspect_ratio: entity.kind === "environment" ? "16:9" : "1:1",
          // The server attaches it when the render settles. Nothing here
          // has to stay open — walking away used to mean the view
          // completed, was paid for, and went nowhere.
          attachTo: { entityId: entity.id, kind: anchor.kind, label: anchor.label },
        }),
      });
      await res.json();
      setNotice?.(`${entity.name}: the ${anchor.label.toLowerCase()} is rendering. It attaches itself when it lands — you can leave this page.`);

      /* Watched, not depended on. If this tab is still here the row
         refreshes on its own; if it is not, the attach happens anyway. */
      const started = Date.now();
      for (;;) {
        if (Date.now() - started > 5 * 60 * 1000) return;
        await new Promise((r) => setTimeout(r, 4000));
        const fresh = await apiFetch(`/api/projects/${projectId}/coverage`, { retries: 0 }).then((r) => r.json());
        const row = (fresh.entities || []).find((x) => x.id === entity.id);
        setCoverage(fresh);
        if (row && row.references > (gap.total - gap.missing.length)) { onChanged?.(); return; }
      }
    } catch (e) {
      setError?.(e?.message || "That view could not be started.");
    } finally {
      setMaking(null);
    }
  }, [gapFor, models, coverage, projectId, onChanged, setNotice, setError]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/entities?limit=100");
        const data = await res.json();
        if (!cancelled) setAvailable(Array.isArray(data.entities) ? data.entities : []);
      } catch { /* the picker stays empty; the filed members still render */ }
    })();
    return () => { cancelled = true; };
  }, [contents]);

  /* Cloning copies the references, not just the description — that is the
     whole point. Two characters built from the SAME photographs read as the
     same person, which is what a double has to be; two characters built from
     the same words read as two strangers who happen to be described alike. */
  const clone = useCallback(async (entity) => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/entities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: entity.kind,
          name: `${entity.name} (double)`,
          description: entity.description || null,
          attributes: entity.attributes || {},
          references: entity.references || [],
          voiceId: entity.voiceId || null,
          voiceName: entity.voiceName || null,
          projectId,
        }),
      });
      const data = await res.json();
      setNotice?.(`${data.entity.name} was created from ${entity.name}'s references — same face, separate character.`);
      onChanged?.();
    } catch (e) {
      setError?.(e?.message || "That could not be cloned.");
    } finally {
      setBusy(false);
    }
  }, [projectId, onChanged, setNotice, setError]);

  const file = useCallback(async (entity, value) => {
    setBusy(true);
    try {
      await apiFetch(`/api/entities/${entity.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: value }),
      });
      setNotice?.(value ? `${entity.name} was added to this project.` : `${entity.name} was removed from this project.`);
      onChanged?.();
    } catch (e) {
      setError?.(e?.message || "That could not be changed.");
    } finally {
      setBusy(false);
      setPicking(null);
    }
  }, [onChanged, setNotice, setError]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)" }}>
      {MEMBER_GROUPS.map((g) => {
        const GroupIcon = g.icon;
        const filed = contents[g.key] || [];
        const free = available.filter((e) => e.kind === g.kind && e.projectId !== projectId);
        return (
          <section key={g.key} style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
            <div className="hs-row hs-row--between" style={{ alignItems: "flex-start" }}>
              <div>
                <h3 style={{ fontSize: "var(--t-sm)", fontWeight: 600 }}>{g.label}</h3>
                <p className="hs-hint" style={{ marginTop: 2 }}>{g.empty}</p>
              </div>
              <div className="hs-row" style={{ gap: "var(--s-2)" }}>
                <button type="button" className="hs-btn hs-btn--outline hs-btn--sm"
                  onClick={() => setPicking(g)} disabled={busy || !free.length}>
                  <IcPlus className="hs-icon-sm" /> Add existing
                </button>
                <Link className="hs-btn hs-btn--ghost hs-btn--sm" href="/studio/cast">
                  <IcSpark className="hs-icon-sm" /> Build a new one
                </Link>
              </div>
            </div>

            {!filed.length ? (
              <p className="hs-hint">
                None filed here yet. {free.length ? `You have ${free.length} you could add.` : "Build one in Cast and it can be filed here."}
              </p>
            ) : (
              <ul className="st-members" role="list">
                {filed.map((e) => {
                  const refs = Array.isArray(e.references) ? e.references : [];
                  const thumb = refs.find((r) => r.kind === "face_front")?.url || refs[0]?.url || null;
                  const gap = gapFor(e.id);
                  return (
                    <li key={e.id} className="st-member">
                      <span className="st-member__frame">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element -- consistent with every other studio thumbnail
                          <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <GroupIcon style={{ width: 18, height: 18, color: "var(--tx-ghost)" }} />
                        )}
                      </span>
                      <span className="st-member__name">{e.name}</span>
                      <span className="st-member__meta hs-mono">
                        {gap ? `${gap.total - gap.missing.length}/${gap.total}` : `${refs.length} ref${refs.length === 1 ? "" : "s"}`}
                      </span>
                      {gap?.canStartFromScratch && (
                        <button type="button" className="hs-btn hs-btn--sm hs-btn--primary"
                          onClick={() => makeViews(e)} disabled={!!making}
                          title="Draw the first view from the description, then generate the rest from it in Cast">
                          {making === e.id ? "Drawing…" : "Draw it"}
                        </button>
                      )}
                      {gap?.needsPhotograph && (
                        <span className="hs-badge hs-badge--caution" title="A face is never invented — add one photograph in Cast and every angle is generated from it">
                          needs a photo
                        </span>
                      )}
                      <button type="button" className="hs-btn hs-btn--sm hs-btn--outline"
                        onClick={() => clone(e)} disabled={busy}
                        title="Same references, separate character — for a double, a twin, or a second version">
                        Clone
                      </button>
                      <button type="button" className="hs-btn hs-btn--sm hs-btn--ghost"
                        onClick={() => file(e, null)} disabled={busy}>
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      <Modal
        open={!!picking}
        onClose={() => setPicking(null)}
        title={picking ? `Add ${picking.label.toLowerCase()} to this project` : ""}
        footer={<button type="button" className="hs-btn hs-btn--ghost" onClick={() => setPicking(null)}>Done</button>}
      >
        <ul className="st-members" role="list">
          {available
            .filter((e) => picking && e.kind === picking.kind && e.projectId !== projectId)
            .map((e) => (
              <li key={e.id} className="st-member">
                <span className="st-member__name">{e.name}</span>
                <span className="st-member__meta hs-mono">
                  {e.projectId ? "in another project" : "unfiled"}
                </span>
                <button type="button" className="hs-btn hs-btn--sm hs-btn--primary"
                  onClick={() => file(e, projectId)} disabled={busy}>
                  Add
                </button>
              </li>
            ))}
        </ul>
      </Modal>
    </div>
  );
}

/* ── Assets ─────────────────────────────────────────────────────────────── */
function AssetsTab({ assets }) {
  if (!assets.length) {
    return (
      <div className="hs-empty">
        <span className="hs-empty__mark"><IcArchive /></span>
        <h3>Nothing made here yet</h3>
        <p>Frames and clips rendered for this project land here with their lineage.</p>
      </div>
    );
  }
  return (
    <div className="st-lib__grid" role="list" aria-label="Project assets">
      {assets.map((a) => (
        <div key={a.id} className="st-item" role="listitem">
          <div className="st-item__frame">
            {a.thumbnailUrl || a.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- consistent with every other studio thumbnail
              <img src={a.thumbnailUrl || a.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ display: "grid", placeItems: "center", height: "100%" }}>
                <IcArchive style={{ width: 24, height: 24, color: "var(--tx-ghost)" }} />
              </span>
            )}
            {a.type && <span className="st-item__kind">{a.type}</span>}
          </div>
          <div className="st-item__body">
            <span className="st-item__name">{a.name || a.prompt?.slice(0, 60) || "Untitled"}</span>
            <span className="st-item__meta">{dateLabel(a.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* Writing the scenario, for anyone who arrives with an idea instead of a
   script. It writes into the textarea rather than saving: a scenario is the
   spine of everything downstream, so replacing one somebody wrote is their
   call, not a side effect of pressing a button. */
function WriteScenario({ projectId, hasDraft, onWritten }) {
  const [open, setOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [minutes, setMinutes] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const write = useCallback(async () => {
    if (!idea.trim()) { setError("Say what it is about."); return; }
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`/api/projects/${projectId}/scenario`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea: idea.trim(), minutes }),
        timeout: 300000,
        retries: 0,
      });
      const data = await res.json();
      onWritten?.(data.script);
      setOpen(false);
    } catch (e) {
      setError(e?.message || "The scenario could not be written.");
    } finally {
      setBusy(false);
    }
  }, [projectId, idea, minutes, onWritten]);

  return (
    <>
      <div className="hs-row" style={{ justifyContent: "flex-start" }}>
        <button type="button" className="hs-btn hs-btn--outline hs-btn--sm" onClick={() => setOpen(true)}>
          <IcSpark className="hs-icon-sm" /> {hasDraft ? "Rewrite it from an idea" : "Write it from an idea"}
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={hasDraft ? "Rewrite the scenario" : "Write the scenario"}
        footer={
          <>
            <button type="button" className="hs-btn hs-btn--ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            <button type="button" className="hs-btn hs-btn--primary" onClick={write} disabled={busy}>
              {busy ? "Writing…" : "Write it"}
            </button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
          {error && <div className="hs-notice hs-notice--fault" role="alert"><span style={{ flex: 1 }}>{error}</span></div>}
          <Field label="What is it about?" hint="A sentence is enough. The cast and places already filed here are written in by name.">
            {(fid) => (
              <textarea id={fid} className="hs-input" rows={5} value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="A man meets a version of himself who has been living the life he sleeps through." />
            )}
          </Field>
          <Field label="How long, in minutes" hint="A shorter piece fully shot beats a longer one half made.">
            {(fid) => (
              <input id={fid} type="number" className="hs-input" min={1} max={30} value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value) || 3)} />
            )}
          </Field>
          {hasDraft && (
            <p className="hs-hint">
              This replaces what is in the box. Nothing is saved until you press Save.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

/* ── Scenario & format ──────────────────────────────────────────────────── */
function SetupTab({ project, settings, kinds, onSave }) {
  const [name, setName] = useState(project.name || "");
  const [brief, setBrief] = useState(project.brief || "");
  const [kind, setKind] = useState(settings.kind || "movie");
  const [aspectRatio, setAspectRatio] = useState(settings.aspectRatio || "16:9");
  const [resolution, setResolution] = useState(settings.resolution || "720p");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(project.name || "");
    setBrief(project.brief || "");
  }, [project.id, project.name, project.brief]);

  const dirty =
    name !== (project.name || "") ||
    brief !== (project.brief || "") ||
    kind !== (settings.kind || "movie") ||
    aspectRatio !== (settings.aspectRatio || "16:9") ||
    resolution !== (settings.resolution || "720p");

  const save = async () => {
    setSaving(true);
    await onSave(
      { name, brief, settings: { kind, aspectRatio, resolution } },
      "Saved. Every new scene inherits this.",
    );
    setSaving(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
      <Field label="Name">
        {(id) => (
          <input id={id} className="hs-input" value={name} maxLength={120}
            onChange={(e) => setName(e.target.value)} />
        )}
      </Field>

      <Field label="Type" hint={kinds.find((k) => k.value === kind)?.blurb}>
        <div className="st-kinds" role="radiogroup" aria-label="Project type">
          {kinds.map((k) => (
            <button key={k.value} type="button" role="radio" aria-checked={kind === k.value}
              className={`st-kind${kind === k.value ? " is-active" : ""}`} onClick={() => setKind(k.value)}>
              <span className="st-kind__label">{k.label}</span>
              <span className="st-kind__unit">in {k.unit}s</span>
            </button>
          ))}
        </div>
      </Field>

      <Field
        label="Scenario"
        hint="The whole story, treatment or brief. Scenes are written against it, so it is only typed once."
      >
        {(id) => (
          <textarea id={id} className="hs-input" rows={14} value={brief}
            onChange={(e) => setBrief(e.target.value)} />
        )}
      </Field>

      <WriteScenario
        projectId={project.id}
        hasDraft={!!brief.trim()}
        onWritten={(script) => setBrief(script)}
      />

      <Field label="Format" hint="Inherited by every shot in this project.">
        <div className="st-project__format" style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-3)" }}>
          <Segmented label="Aspect ratio" value={aspectRatio} onChange={setAspectRatio}
            options={ASPECTS.map((a) => ({ value: a, label: a }))} />
          <Segmented label="Resolution" value={resolution} onChange={setResolution}
            options={RESOLUTIONS.map((r) => ({ value: r, label: r }))} />
        </div>
      </Field>

      <Field
        label="Stills"
        hint={`Only models that take a reference image and shoot ${aspectRatio} — a model that cannot be shown the face invents it again every shot.`}
      >
        <ModelPicker
          models={imageChoices}
          value={imageModel}
          onSelect={setImageModel}
          loading={modelsLoading}
          label="Image model"
          emptyHint={`No image model on the catalog both takes references and shoots ${aspectRatio}.`}
        />
      </Field>

      <Field
        label="Motion"
        hint="Only models that can start from an approved still. That is what makes a wrong face cost an image instead of a video."
      >
        <ModelPicker
          models={videoChoices}
          value={videoModel}
          onSelect={setVideoModel}
          loading={modelsLoading}
          label="Video model"
          emptyHint={`No video model on the catalog both takes a first frame and shoots ${aspectRatio}.`}
        />
      </Field>

      {voiceChoices.length > 0 && (
        <Field label="Voice" hint="Used when a shot has dialogue.">
          <ModelPicker
            models={voiceChoices}
            value={voiceModel}
            onSelect={setVoiceModel}
            loading={modelsLoading}
            label="Voice model"
          />
        </Field>
      )}

      <div className="hs-row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="hs-btn hs-btn--primary" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
