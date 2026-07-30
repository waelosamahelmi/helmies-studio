"use client";

/* ══════════════════════════════════════════════════════════════════════════
   CONTACT
   ──────────────────────────────────────────────────────────────────────────
   There is no /api/contact route in this codebase — the previous version of
   this page POSTed to one and every submission 404'd silently. So the form
   is honest about what it does: it validates, picks the right inbox for the
   topic, and hands a fully composed message to the user's mail client. The
   raw addresses are on the page too, for anyone without one.
   ══════════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { IcCheck, IcCopy, IcExternal, IcClock } from "@/components/studio/kit/Icons";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Each topic goes to the inbox that can actually answer it. */
const TOPICS = [
  { id: "general",   label: "General question",  to: "hello@helmies.fi" },
  { id: "billing",   label: "Billing or credits", to: "hello@helmies.fi" },
  { id: "technical", label: "Something is broken", to: "hello@helmies.fi" },
  { id: "feature",   label: "Feature request",   to: "hello@helmies.fi" },
  { id: "privacy",   label: "Privacy or my data", to: "privacy@helmies.fi" },
  { id: "legal",     label: "Legal",             to: "legal@helmies.fi" },
];

const DIRECT = [
  { address: "hello@helmies.fi",   what: "Support, billing, everything else" },
  { address: "privacy@helmies.fi", what: "Data access, deletion, GDPR requests" },
  { address: "legal@helmies.fi",   what: "Terms, licensing, takedowns" },
];

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});
  const [handed, setHanded] = useState(null);   // { to, subject, body }
  const [copied, setCopied] = useState(false);

  const clear = (key) => setErrors((p) => ({ ...p, [key]: "" }));

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = "Tell us who you are.";
    if (!email.trim()) errs.email = "We need an address to reply to.";
    else if (!EMAIL_RE.test(email.trim())) errs.email = "That does not look like an email address.";
    if (!topic) errs.topic = "Pick a topic so it reaches the right inbox.";
    if (!message.trim()) errs.message = "Write your question.";
    else if (message.trim().length < 10) errs.message = "A few more words will get you a better answer.";
    return errs;
  };

  const submit = (e) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const picked = TOPICS.find((t) => t.id === topic);
    const subject = `[${picked.label}] from ${name.trim()}`;
    const body = `${message.trim()}\n\n—\n${name.trim()}\n${email.trim()}`;

    setHanded({ to: picked.to, subject, body });
    setCopied(false);
    window.location.href =
      `mailto:${picked.to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${handed.to}\nSubject: ${handed.subject}\n\n${handed.body}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <a className="hs-skip" href="#main">Skip to content</a>
      <Navbar />

      <main id="main" className="hs-wrap hs-wrap--narrow hs-section--tight">
        <header className="hs-head">
          <span className="hs-eyebrow">Contact</span>
          <h1 style={{ fontSize: "var(--t-2xl)" }}>Write to us</h1>
          <p>
            A person reads every message. Answers usually land within one working day.
            Quick questions are often already covered in the{" "}
            <Link href="/faq" style={{ color: "var(--filament-lit)", textDecoration: "underline", textUnderlineOffset: 3 }}>FAQ</Link>.
          </p>
        </header>

        <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
          <section className="pg-panel" aria-labelledby="h-form">
            <div className="pg-panel__head">
              <h2 id="h-form">Compose a message</h2>
              <span className="hs-badge"><IcClock className="hs-icon-sm" /> ~1 working day</span>
            </div>

            <div className="pg-panel__body">
              {handed && (
                <div className="hs-notice hs-notice--signal" role="status">
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", minWidth: 0 }}>
                    <strong>Your mail app should have opened with the message ready to send.</strong>
                    <span>
                      If nothing happened, copy it and send it to{" "}
                      <span className="hs-mono">{handed.to}</span> yourself.
                    </span>
                    <div className="hs-row">
                      <button type="button" className="hs-btn hs-btn--sm" onClick={copy}>
                        {copied ? <IcCheck className="hs-icon-sm" /> : <IcCopy className="hs-icon-sm" />}
                        {copied ? "Copied" : "Copy the message"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={submit} noValidate>
                <div className="hs-field">
                  <label className="hs-label" htmlFor="c-name">Your name</label>
                  <input
                    id="c-name"
                    className="hs-input"
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); clear("name"); }}
                    autoComplete="name"
                    required
                    aria-invalid={errors.name ? "true" : undefined}
                    aria-describedby={errors.name ? "c-name-error" : undefined}
                  />
                  {errors.name && <p className="hs-error" id="c-name-error">{errors.name}</p>}
                </div>

                <div className="hs-field">
                  <label className="hs-label" htmlFor="c-email">Your email</label>
                  <input
                    id="c-email"
                    className="hs-input"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clear("email"); }}
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    aria-invalid={errors.email ? "true" : undefined}
                    aria-describedby={errors.email ? "c-email-error" : undefined}
                  />
                  {errors.email && <p className="hs-error" id="c-email-error">{errors.email}</p>}
                </div>

                <div className="hs-field">
                  <label className="hs-label" htmlFor="c-topic">Topic</label>
                  <select
                    id="c-topic"
                    className="hs-select"
                    value={topic}
                    onChange={(e) => { setTopic(e.target.value); clear("topic"); }}
                    required
                    aria-invalid={errors.topic ? "true" : undefined}
                    aria-describedby={errors.topic ? "c-topic-error" : "c-topic-hint"}
                  >
                    <option value="" disabled>Choose one</option>
                    {TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  {errors.topic
                    ? <p className="hs-error" id="c-topic-error">{errors.topic}</p>
                    : <p className="hs-hint" id="c-topic-hint">
                        {topic
                          ? <>Goes to <span className="hs-mono">{TOPICS.find((t) => t.id === topic).to}</span>.</>
                          : "Each topic has its own inbox."}
                      </p>}
                </div>

                <div className="hs-field">
                  <label className="hs-label" htmlFor="c-message">Message</label>
                  <textarea
                    id="c-message"
                    className="hs-textarea"
                    rows={6}
                    value={message}
                    onChange={(e) => { setMessage(e.target.value); clear("message"); }}
                    required
                    aria-invalid={errors.message ? "true" : undefined}
                    aria-describedby={errors.message ? "c-message-error" : "c-message-hint"}
                    placeholder="What happened, what you expected, and — if it is a generation problem — the model and the tool."
                  />
                  {errors.message
                    ? <p className="hs-error" id="c-message-error">{errors.message}</p>
                    : <p className="hs-hint" id="c-message-hint">
                        <span className="hs-mono">{message.trim().length}</span> characters. Detail speeds up the answer.
                      </p>}
                </div>

                <button type="submit" className="hs-btn hs-btn--primary hs-btn--lg" style={{ marginTop: "var(--s-5)" }}>
                  Open in my mail app
                  <IcExternal className="hs-icon-sm" />
                </button>
              </form>
            </div>
          </section>

          <section className="pg-panel" aria-labelledby="h-direct">
            <div className="pg-panel__head">
              <h2 id="h-direct">Straight to the inbox</h2>
            </div>
            <div className="pg-panel__body">
              <div>
                {DIRECT.map((d) => (
                  <div className="pg-kv" key={d.address}>
                    <div>
                      <div className="pg-kv__k">
                        <a
                          href={`mailto:${d.address}`}
                          className="hs-mono"
                          style={{ textDecoration: "underline", textUnderlineOffset: 3 }}
                        >
                          {d.address}
                        </a>
                      </div>
                      <div className="pg-kv__sub">{d.what}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="hs-hint">Helmies Oy, Finland. We reply from the same address you write to.</p>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}
