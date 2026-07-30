"use client";

/* ══════════════════════════════════════════════════════════════════════════
   GALLERY — client
   ──────────────────────────────────────────────────────────────────────────
   Two endpoints, two jobs:
     · GET /api/generations/status?limit=50  — the last 50 runs of ANY status.
       Anything still moving, or that failed, is listed at the top.
     · GET /api/generations?status=completed — the finished work, paginated,
       optionally narrowed by tool. This fills the masonry.

   Polling only runs while there is something to watch AND the tab is visible.
   A hidden tab burns the user's battery and our rate limit for nothing, so
   the tick returns early on document.visibilityState and the whole thing is
   torn down on unmount.
   ══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/client-fetch";
import { TOOLS } from "@/components/studio/kit/tools";
import { IcArchive, IcLock, IcAlert, IcRefresh, IcClock, IcExternal } from "@/components/studio/kit/Icons";

const PAGE = 48;
const POLL_MS = 6000;

const RUNNING = new Set(["pending", "processing", "queued", "running", "starting"]);
const FAILED = new Set(["failed", "error", "cancelled", "canceled"]);

const TOOL_LABEL = Object.fromEntries(TOOLS.map((t) => [t.id, t.label]));

const isVideo = (u) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u || "");
const isAudio = (u) => /\.(mp3|wav|ogg|flac|m4a|aac)(\?|#|$)/i.test(u || "");

function ago(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function SignedOut() {
  return (
    <div className="hs-empty">
      <span className="hs-empty__mark"><IcLock /></span>
      <h2>Your gallery is behind the sign-in</h2>
      <p>
        The gallery shows your own generations and the jobs still running on your
        account, so it needs to know who you are. Signing in takes a moment and
        starts you with 100 credits.
      </p>
      <div className="pg-head__row">
        <Link href="/login?callbackUrl=%2Fgallery" className="hs-btn hs-btn--primary">Sign in</Link>
        <Link href="/login?new=1" className="hs-btn hs-btn--outline">Create an account</Link>
      </div>
    </div>
  );
}

export default function GalleryClient() {
  const { status: authStatus } = useSession();
  const authed = authStatus === "authenticated";

  const [recent, setRecent] = useState([]);
  const [done, setDone] = useState([]);
  const [total, setTotal] = useState(0);
  const [tool, setTool] = useState("all");
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [fault, setFault] = useState(null);
  const [seen, setSeen] = useState([]);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const noteTools = useCallback((rows) => {
    const found = rows.map((r) => r.tool).filter(Boolean);
    if (!found.length) return;
    setSeen((prev) => {
      const next = new Set(prev);
      let grew = false;
      for (const t of found) if (!next.has(t)) { next.add(t); grew = true; }
      return grew ? Array.from(next) : prev;
    });
  }, []);

  /* ── The running/failed feed ───────────────────────────────────────── */
  const loadRecent = useCallback(async ({ quiet = false } = {}) => {
    try {
      const res = await apiFetch("/api/generations/status?limit=50", { retries: quiet ? 0 : 2 });
      const data = await res.json();
      if (!alive.current) return [];
      const rows = data.generations || [];
      setRecent(rows);
      noteTools(rows);
      return rows;
    } catch (err) {
      if (alive.current && !quiet) setFault(err?.message || "Could not read the job queue.");
      return [];
    }
  }, [noteTools]);

  /* ── The finished work ─────────────────────────────────────────────── */
  const loadDone = useCallback(async (offset, currentTool) => {
    const qs = new URLSearchParams({
      status: "completed",
      limit: String(PAGE),
      offset: String(offset),
    });
    if (currentTool && currentTool !== "all") qs.set("tool", currentTool);

    const res = await apiFetch(`/api/generations?${qs.toString()}`);
    const data = await res.json();
    if (!alive.current) return;
    const rows = data.generations || [];
    noteTools(rows);
    setTotal(data.total || 0);
    setDone((prev) => (offset === 0 ? rows : [...prev, ...rows]));
  }, [noteTools]);

  /* ── First load / tool change ──────────────────────────────────────── */
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    setLoading(true);
    setFault(null);

    (async () => {
      try {
        await Promise.all([loadDone(0, tool), loadRecent()]);
      } catch (err) {
        if (!cancelled && alive.current) setFault(err?.message || "Your work could not be loaded.");
      } finally {
        if (!cancelled && alive.current) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [authed, tool, loadDone, loadRecent]);

  const active = useMemo(() => recent.filter((g) => RUNNING.has(g.status)), [recent]);
  const broken = useMemo(() => recent.filter((g) => FAILED.has(g.status)), [recent]);

  /* ── Poll — visible tab only, and only while something is moving ───── */
  const activeCount = active.length;
  useEffect(() => {
    if (!authed || activeCount === 0) return;

    let stopped = false;
    let timer = null;

    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState !== "visible") return;
      const rows = await loadRecent({ quiet: true });
      if (stopped) return;
      const stillRunning = rows.filter((g) => RUNNING.has(g.status)).length;
      // Something landed since the last tick — pull the finished list again.
      if (stillRunning < activeCount) loadDone(0, tool).catch(() => {});
    };

    const onVisible = () => { if (document.visibilityState === "visible") tick(); };

    timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authed, activeCount, tool, loadRecent, loadDone]);

  async function loadMore() {
    setMore(true);
    try {
      await loadDone(done.length, tool);
    } catch (err) {
      if (alive.current) setFault(err?.message || "Could not load the next page.");
    } finally {
      if (alive.current) setMore(false);
    }
  }

  function retry() {
    setFault(null);
    setLoading(true);
    Promise.all([loadDone(0, tool), loadRecent()])
      .catch((err) => { if (alive.current) setFault(err?.message || "Still not loading."); })
      .finally(() => { if (alive.current) setLoading(false); });
  }

  if (authStatus === "loading") {
    return (
      <div className="pg-gal" aria-busy="true">
        <p className="hs-sr" role="status">Checking your session</p>
        {[220, 300, 180, 260, 200, 320, 240, 190].map((h, i) => (
          <div key={i} className="pg-gal__item" aria-hidden="true">
            <div className="hs-skel" style={{ height: h, borderRadius: 0 }} />
          </div>
        ))}
      </div>
    );
  }

  if (!authed) return <SignedOut />;

  const chips = TOOLS.filter((t) => seen.includes(t.id));
  const hasMore = done.length < total;

  return (
    <>
      {fault && (
        <div className="hs-notice hs-notice--fault" role="alert" style={{ marginBottom: "var(--s-5)" }}>
          <IcAlert className="hs-icon" />
          <span>{fault}</span>
          <button type="button" className="hs-btn hs-btn--sm hs-btn--ghost" onClick={retry}>
            <IcRefresh className="hs-icon-sm" />
            Retry
          </button>
        </div>
      )}

      {/* ── Running and failed ─────────────────────────────────────────── */}
      {(active.length > 0 || broken.length > 0) && (
        <section aria-labelledby="jobs-h" style={{ marginBottom: "var(--s-10)" }}>
          <div className="hs-row hs-row--between" style={{ marginBottom: "var(--s-4)" }}>
            <h2 id="jobs-h" style={{ fontSize: "var(--t-md)" }}>Queue</h2>
            <span className="pg-count" aria-live="polite">
              {active.length} running · {broken.length} failed
            </span>
          </div>

          <div className="pg-jobs">
            {active.map((g) => (
              <div key={g.id} className="pg-job">
                <span className="hs-dot hs-dot--live" aria-hidden="true" />
                <span className="pg-job__what" title={g.prompt || g.model}>
                  {g.prompt || g.model || "Untitled run"}
                </span>
                <span className="pg-job__when">
                  <IcClock className="hs-icon-sm" style={{ display: "inline", verticalAlign: "-2px" }} />{" "}
                  {ago(g.createdAt)}
                </span>
                <span className="hs-badge hs-badge--caution">{g.status}</span>
              </div>
            ))}

            {broken.map((g) => (
              <div key={g.id} className="pg-job">
                <span className="hs-dot hs-dot--fault" aria-hidden="true" />
                <span className="pg-job__what" title={g.error || g.prompt || g.model}>
                  {g.prompt || g.model || "Untitled run"}
                  {g.error ? ` — ${g.error}` : ""}
                </span>
                <span className="pg-job__when">{ago(g.createdAt)}</span>
                <span className="hs-row" style={{ gap: "var(--s-2)" }}>
                  <span className="hs-badge hs-badge--fault">{g.status}</span>
                  <Link
                    href={`/studio/${g.tool || "image"}`}
                    className="hs-btn hs-btn--sm hs-btn--ghost"
                  >
                    Run again
                  </Link>
                </span>
              </div>
            ))}
          </div>

          <p className="hs-hint" style={{ marginTop: "var(--s-3)" }}>
            {active.length > 0
              ? "This list refreshes every few seconds while the tab is open. Credits for a failed run are returned to your balance."
              : "Credits for a failed run are returned to your balance."}
          </p>
        </section>
      )}

      {/* ── Tool filter ────────────────────────────────────────────────── */}
      {chips.length > 1 && (
        <div className="hs-chips" role="group" aria-label="Filter by studio" style={{ marginBottom: "var(--s-6)" }}>
          <button type="button" className="hs-chip" aria-pressed={tool === "all"} onClick={() => setTool("all")}>
            Everything
          </button>
          {chips.map((t) => (
            <button
              key={t.id}
              type="button"
              className="hs-chip"
              aria-pressed={tool === t.id}
              onClick={() => setTool(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Finished work ──────────────────────────────────────────────── */}
      <section aria-labelledby="work-h">
        <div className="hs-row hs-row--between" style={{ marginBottom: "var(--s-4)" }}>
          <h2 id="work-h" style={{ fontSize: "var(--t-md)" }}>Finished work</h2>
          {!loading && total > 0 && (
            <span className="pg-count">
              {done.length} of {total} shown
            </span>
          )}
        </div>

        {loading && (
          <div className="pg-gal" aria-busy="true">
            <p className="hs-sr" role="status">Loading your generations</p>
            {[240, 320, 200, 280, 210, 340, 260, 190, 300, 230, 270, 210].map((h, i) => (
              <div key={i} className="pg-gal__item" aria-hidden="true">
                <div className="hs-skel" style={{ height: h, borderRadius: 0 }} />
              </div>
            ))}
          </div>
        )}

        {!loading && done.length === 0 && (
          <div className="hs-empty">
            <span className="hs-empty__mark"><IcArchive /></span>
            <h3>{tool === "all" ? "Nothing finished yet" : `Nothing from ${TOOL_LABEL[tool] || tool} yet`}</h3>
            <p>
              {tool === "all"
                ? "Everything you generate lands here — stills, video and audio, newest first, with the model and the credits it cost."
                : "You have not completed a run in this studio yet. Switch the filter back, or open the studio and make the first one."}
            </p>
            {tool === "all" ? (
              <Link href="/studio/image" className="hs-btn hs-btn--primary">Make the first one</Link>
            ) : (
              <div className="pg-head__row">
                <Link href={`/studio/${tool}`} className="hs-btn hs-btn--primary">Open {TOOL_LABEL[tool] || tool}</Link>
                <button type="button" className="hs-btn hs-btn--outline" onClick={() => setTool("all")}>
                  Show everything
                </button>
              </div>
            )}
          </div>
        )}

        {!loading && done.length > 0 && (
          <>
            <div className="pg-gal">
              {done.map((g) => {
                const url = g.outputUrl;
                const label = g.prompt || g.model || "Generation";

                if (!url) return null;

                if (isAudio(url)) {
                  return (
                    <div key={g.id} className="pg-gal__item" style={{ padding: "var(--s-4)" }}>
                      <p style={{ fontSize: "var(--t-tiny)", marginBottom: "var(--s-3)" }}>{label}</p>
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <audio src={url} controls preload="none" style={{ width: "100%" }} aria-label={label} />
                      <p className="hs-mono hs-mute" style={{ fontSize: 10, marginTop: "var(--s-3)" }}>
                        {g.model} · {g.creditsUsed} cr · {ago(g.createdAt)}
                      </p>
                    </div>
                  );
                }

                return (
                  <a
                    key={g.id}
                    className="pg-gal__item"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open full size: ${label}`}
                  >
                    {isVideo(url) ? (
                      <video src={url} muted loop playsInline preload="metadata" />
                    ) : (
                      <img src={url} alt={label} loading="lazy" decoding="async" />
                    )}
                    <span className="pg-gal__meta">
                      <span>{g.model}</span>
                      <span aria-hidden="true">·</span>
                      <span>{g.creditsUsed} cr</span>
                      <span aria-hidden="true">·</span>
                      <span>{ago(g.createdAt)}</span>
                      <IcExternal className="hs-icon-sm" style={{ marginLeft: "auto" }} />
                    </span>
                  </a>
                );
              })}
            </div>

            {hasMore && (
              <div className="pg-more">
                <button type="button" className="hs-btn hs-btn--outline" disabled={more} onClick={loadMore}>
                  {more ? <span className="hs-spin" /> : null}
                  {more ? "Loading" : `Load ${Math.min(PAGE, total - done.length)} more`}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
