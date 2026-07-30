import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getCatalogModels } from "@/lib/model-catalog";
import { TOOLS } from "@/components/studio/kit/tools";
import { IcBolt, IcCheck, IcChevronRight } from "@/components/studio/kit/Icons";

export const revalidate = 900;

export const metadata = {
  title: "Helmies Studio — one desk for generated image, video and sound",
  description:
    "A production desk with 70+ generation models on one catalog and one credit balance. Image, video, lip-sync, music and multi-shot direction, with the cost of every render shown before you spend it.",
  alternates: { canonical: "https://studio.helmies.fi" },
};

/* The catalog is the honest headline — real models at real prices. If the
   database is unreachable the page still renders; the board just says so. */
async function loadCatalog() {
  try {
    const models = await getCatalogModels({});
    return (models || [])
      .filter((m) => m.displayName && !m.isDeprecated)
      .sort((a, b) => (b.credits ?? 0) - (a.credits ?? 0));
  } catch {
    return [];
  }
}

const SHOWCASE = [
  "/assets/warrior_girl_e29532086b-40.webp",
  "/assets/ai_cinematic_video_generator_hero_image_0f96f59168-41.webp",
  "/assets/photo-1506905925346-21bda4d32df4-6.webp",
  "/assets/J6-BrUzggQUXdbktr9GcH_ZYLM1F22-13.webp",
  "/assets/photo-1620121692029-d088224ddc74-11.webp",
  "/assets/260118_RecursiveIdentities_bright_1024px-768x768-15.webp",
  "/assets/photo-1551434678-e076c223a692-10.webp",
  "/assets/photo-1547036967-23d11aacaee0-7.webp",
];

const CREDIT_FACTS = [
  {
    h: "One balance",
    p: "Credits work across every instrument and every model. Moving from a cheap draft model to a premium one is a choice you make per render, not a plan you upgrade.",
  },
  {
    h: "Priced per render",
    p: "Resolution, duration and reference count all move the number, and the meter moves with them. Nothing is quoted at one price and charged at another.",
  },
  {
    h: "Released on failure",
    p: "Credits are reserved when a job starts and only settled when it finishes. If a provider fails, the reservation is released back to your balance.",
  },
];

const INCLUDED = [
  "Brand kits that constrain palette, tone and photography style",
  "Project memory for characters, styles and reusable context",
  "An asset library that keeps the lineage of every render",
  "Multi-shot direction with continuity between takes",
  "Reusable workflows you can run again on new inputs",
  "API keys for your own integrations",
];

export default async function Home() {
  const models = await loadCatalog();

  const providers = new Set(models.map((m) => m.provider).filter(Boolean));
  const priced = models.map((m) => m.credits).filter((c) => Number.isFinite(c) && c > 0);
  const floor = priced.length ? Math.min(...priced) : null;
  const board = models.slice(0, 14);

  return (
    <>
      <Navbar />

      <main id="main">
        {/* ══ Hero — the catalog is the argument ═══════════════════════ */}
        <section className="pg-hero">
          <div className="pg-hero__copy">
            <span className="hs-eyebrow">Helmies Studio</span>

            <h1>
              Every model worth using.
              <br />
              <em>One desk. One balance.</em>
            </h1>

            <p className="pg-hero__lede">
              Image, video, lip-sync, music and multi-shot direction — with the
              cost of each render shown before you spend it. No per-tool
              subscriptions, no surprise invoice.
            </p>

            <div className="pg-hero__cta">
              <Link href="/login?new=1" className="hs-btn hs-btn--primary hs-btn--lg">
                Start free
                <IcBolt className="hs-icon-sm" />
              </Link>
              <Link href="/studio" className="hs-btn hs-btn--outline hs-btn--lg">
                Open the studio
                <IcChevronRight className="hs-icon-sm" />
              </Link>
            </div>

            <p className="pg-hero__note">
              <span className="hs-dot hs-dot--signal" />
              Free credits on signup — no card required
            </p>
          </div>

          <div className="pg-board">
            <div className="pg-board__head">
              <span>Live catalog</span>
              <span style={{ marginLeft: "auto" }}>Credits</span>
            </div>

            <div className="pg-board__list">
              {board.length === 0 ? (
                <p className="hs-hint" style={{ padding: "var(--s-8)", textAlign: "center" }}>
                  The catalog is syncing. Open the studio to see the current
                  model list.
                </p>
              ) : (
                board.map((m) => (
                  <div key={m.id} className="pg-board__row">
                    <span className="pg-board__name">{m.displayName}</span>
                    <span className="pg-board__who">{m.provider}</span>
                    <span className="pg-board__cr">{m.credits ?? "—"}</span>
                  </div>
                ))
              )}
            </div>

            <div className="pg-board__foot">
              <span>{models.length ? `${models.length} models` : "Catalog syncing"}</span>
              <Link
                href="/models"
                style={{ color: "var(--tx-dim)", textDecoration: "underline", textUnderlineOffset: 2 }}
              >
                See all
              </Link>
            </div>
          </div>
        </section>

        {/* ══ Proof ════════════════════════════════════════════════════ */}
        <dl className="pg-strip">
          <div>
            <dt>{models.length || "70+"}</dt>
            <dd>Models</dd>
          </div>
          <div>
            <dt>{providers.size || "12"}</dt>
            <dd>Providers</dd>
          </div>
          <div>
            <dt>{TOOLS.length}</dt>
            <dd>Instruments</dd>
          </div>
          <div>
            <dt>{floor ?? "1"}</dt>
            <dd>Credits from</dd>
          </div>
        </dl>

        {/* ══ Instruments ══════════════════════════════════════════════ */}
        <section className="hs-wrap hs-section">
          <div className="hs-head">
            <span className="hs-eyebrow">The desk</span>
            <h2>Twenty instruments, each built for its own job</h2>
            <p>
              A shot board for direction. A timeline for cutting. A layer stack
              for composition. The tools don&rsquo;t share a layout, because the
              work doesn&rsquo;t share a shape.
            </p>
          </div>

          <div className="pg-tools">
            {TOOLS.map(({ id, title, blurb, icon: Icon }) => (
              <Link key={id} href={`/studio/${id}`} className="pg-tool">
                <Icon />
                <h3>{title}</h3>
                <p>{blurb}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* ══ Work ═════════════════════════════════════════════════════ */}
        <section className="hs-wrap hs-section--tight">
          <div className="hs-head">
            <span className="hs-eyebrow">Output</span>
            <h2>Made on the desk</h2>
          </div>
          <div className="pg-showcase">
            {SHOWCASE.map((src) => (
              <figure key={src}>
                <img src={src} alt="" loading="lazy" decoding="async" />
              </figure>
            ))}
          </div>
        </section>

        {/* ══ Credits ══════════════════════════════════════════════════ */}
        <section className="hs-wrap hs-section">
          <div className="hs-head">
            <span className="hs-eyebrow">Credits</span>
            <h2>You see the cost before you spend it</h2>
            <p>
              Every model is priced in credits. The meter beside the render
              button shows what this job costs and what your balance will be
              afterwards — before you commit to it.
            </p>
          </div>

          <div className="hs-grid hs-grid--3">
            {CREDIT_FACTS.map(({ h, p }) => (
              <div key={h} className="hs-card">
                <h3 style={{ fontSize: "var(--t-base)", fontWeight: 600, marginBottom: "var(--s-2)" }}>{h}</h3>
                <p style={{ fontSize: "var(--t-sm)", color: "var(--tx-dim)", lineHeight: 1.6 }}>{p}</p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "var(--s-8)", display: "flex", gap: "var(--s-3)", flexWrap: "wrap" }}>
            <Link href="/pricing" className="hs-btn hs-btn--primary">See pricing</Link>
            <Link href="/models" className="hs-btn hs-btn--outline">Browse the catalog</Link>
          </div>
        </section>

        {/* ══ Included ═════════════════════════════════════════════════ */}
        <section className="hs-wrap hs-section">
          <div className="hs-grid hs-grid--2" style={{ alignItems: "start", gap: "var(--s-10)" }}>
            <div className="hs-head" style={{ marginBottom: 0 }}>
              <span className="hs-eyebrow">Included</span>
              <h2>Everything on one account</h2>
              <p>
                Brand kits, project memory and an asset library that keeps the
                lineage of every render — so a character stays the same
                character across a hundred shots.
              </p>
            </div>

            <ul style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)", listStyle: "none" }}>
              {INCLUDED.map((t) => (
                <li
                  key={t}
                  style={{ display: "flex", gap: "var(--s-3)", alignItems: "flex-start", fontSize: "var(--t-sm)", color: "var(--tx-dim)", lineHeight: 1.6 }}
                >
                  <IcCheck className="hs-icon-sm" style={{ color: "var(--signal)", marginTop: 3, flex: "none" }} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ══ Close ════════════════════════════════════════════════════ */}
        <section className="hs-wrap hs-section--tight" style={{ paddingBottom: "var(--s-24)" }}>
          <div
            className="hs-card"
            style={{
              padding: "clamp(var(--s-8), 6vw, var(--s-16))",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--s-4)",
            }}
          >
            <h2 style={{ fontSize: "var(--t-2xl)", fontWeight: 600, maxWidth: "20ch" }}>
              Open the desk and make something
            </h2>
            <p style={{ fontSize: "var(--t-sm)", color: "var(--tx-dim)", maxWidth: "46ch", lineHeight: 1.6 }}>
              Free credits on signup. No card, no trial countdown, and no
              per-tool upsell once you are inside.
            </p>
            <Link href="/login?new=1" className="hs-btn hs-btn--primary hs-btn--lg" style={{ marginTop: "var(--s-2)" }}>
              Start free
              <IcBolt className="hs-icon-sm" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
