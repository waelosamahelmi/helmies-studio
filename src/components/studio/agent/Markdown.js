"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/* ══════════════════════════════════════════════════════════════════════════
   AGENT MARKDOWN — safe rendering for assistant prose (EDITSv1 E3.3)
   ──────────────────────────────────────────────────────────────────────────
   react-markdown + remark-gfm, skipHtml (raw HTML in the LLM's output is
   dropped, never injected), links open in a new tab. Styled to sit inside
   .st-msg__text's existing typography — headings stay modest, this is a
   chat bubble, not an article.
   ══════════════════════════════════════════════════════════════════════════ */

const components = {
  a: ({ node: _n, children, href, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
  h1: ({ node: _n, children }) => <p className="st-md__heading">{children}</p>,
  h2: ({ node: _n, children }) => <p className="st-md__heading">{children}</p>,
  h3: ({ node: _n, children }) => <p className="st-md__heading">{children}</p>,
  h4: ({ node: _n, children }) => <p className="st-md__heading">{children}</p>,
  h5: ({ node: _n, children }) => <p className="st-md__heading">{children}</p>,
  h6: ({ node: _n, children }) => <p className="st-md__heading">{children}</p>,
  pre: ({ node: _n, children }) => <pre className="st-md__code">{children}</pre>,
  table: ({ node: _n, children }) => (
    <div className="st-md__tablewrap">
      <table>{children}</table>
    </div>
  ),
};

export default function Markdown({ children }) {
  if (!children) return null;
  return (
    <div className="st-msg__text st-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {String(children)}
      </ReactMarkdown>
    </div>
  );
}
