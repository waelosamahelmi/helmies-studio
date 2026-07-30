import Link from "next/link";

const COLUMNS = [
  {
    title: "Studio",
    links: [
      { href: "/studio/image",   label: "Image" },
      { href: "/studio/video",   label: "Video" },
      { href: "/studio/director",label: "Director" },
      { href: "/studio/canvas",  label: "Canvas" },
      { href: "/studio/audio",   label: "Audio" },
    ],
  },
  {
    title: "Product",
    links: [
      { href: "/models",    label: "Model catalog" },
      { href: "/templates", label: "Templates" },
      { href: "/gallery",   label: "Gallery" },
      { href: "/pricing",   label: "Pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/faq",     label: "FAQ" },
      { href: "/contact", label: "Contact" },
      { href: "/terms",   label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="pg-foot">
      <div className="pg-foot__in">
        <div className="pg-foot__col">
          <Link href="/" className="pg-logo" aria-label="Helmies Studio home">
            <img src="/ico.svg" alt="" width={24} height={24} />
            <strong>Helmies</strong>
            <span>Studio</span>
          </Link>
          <p style={{ fontSize: "var(--t-tiny)", color: "var(--tx-mute)", lineHeight: 1.6, maxWidth: "34ch" }}>
            A production desk for generated image, video and sound. One catalog,
            one balance, one place to work.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title} className="pg-foot__col">
            <h4>{col.title}</h4>
            {col.links.map((l) => (
              <Link key={l.href} href={l.href}>{l.label}</Link>
            ))}
          </div>
        ))}
      </div>

      <div className="pg-foot__base">
        <span>© {new Date().getFullYear()} Helmies Oy</span>
        <span className="hs-mono">studio.helmies.fi</span>
      </div>
    </footer>
  );
}
