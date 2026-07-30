"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { IconArrowUpRight, IconMail, IconCheck, IconChevron } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

const SUBJECTS = [
  "General Inquiry",
  "Billing",
  "Technical Support",
  "Feature Request",
  "Other",
];

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = "Name is required";
    if (!email.trim()) {
      errs.email = "Email is required";
    } else if (!validateEmail(email)) {
      errs.email = "Please enter a valid email address";
    }
    if (!subject) errs.subject = "Please select a subject";
    if (!message.trim()) {
      errs.message = "Message is required";
    } else if (message.trim().length < 10) {
      errs.message = "Message must be at least 10 characters";
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), subject, message: message.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to send message. Please try again.");
      }
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <>
        <Navbar />
        <div className="grain" aria-hidden="true" />
        <motion.div
          className="page"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <div className="page__head">
            <div className="eyebrow mb-5">Contact</div>
            <h1 className="page__title">
              Get in <em>touch</em>
            </h1>
          </div>
          <div className="v6-contact">
            <div className="v6-contact-success">
              <div className="v6-contact-success-icon">
                <IconCheck />
              </div>
              <h2
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  marginBottom: "0.75rem",
                }}
              >
                Message sent
              </h2>
              <p style={{ fontSize: "0.9rem", color: "rgba(242,242,247,0.55)", lineHeight: 1.6 }}>
                Thank you for reaching out. We typically respond within 24 hours on business days.
              </p>
            </div>
          </div>
        </motion.div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="grain" aria-hidden="true" />

      <motion.div
        className="page"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
      >
        <div className="page__head">
          <div className="eyebrow mb-5">Contact</div>
          <h1 className="page__title">
            Get in <em>touch</em>
          </h1>
          <p className="page__sub">
            Have a question or need help? Send us a message and we&rsquo;ll get back to you as
            soon as possible.
          </p>
        </div>

        <div className="v6-contact">
          <form className="v6-contact-form" onSubmit={handleSubmit} noValidate>
            {/* Name */}
            <div className="field" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.5rem", padding: "0.875rem 1rem" }}>
              <label
                htmlFor="contact-name"
                style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(242,242,247,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}
              >
                Name
              </label>
              <input
                id="contact-name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: "" })); }}
                autoComplete="name"
              />
              {errors.name && <p className="v6-contact-error">{errors.name}</p>}
            </div>

            {/* Email */}
            <div className="field" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.5rem", padding: "0.875rem 1rem" }}>
              <label
                htmlFor="contact-email"
                style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(242,242,247,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}
              >
                Email
              </label>
              <input
                id="contact-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: "" })); }}
                autoComplete="email"
              />
              {errors.email && <p className="v6-contact-error">{errors.email}</p>}
            </div>

            {/* Subject */}
            <div className="field" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.5rem", padding: "0.875rem 1rem" }}>
              <label
                htmlFor="contact-subject"
                style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(242,242,247,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}
              >
                Subject
              </label>
              <div style={{ position: "relative" }}>
                <select
                  id="contact-subject"
                  value={subject}
                  onChange={(e) => { setSubject(e.target.value); setErrors((p) => ({ ...p, subject: "" })); }}
                >
                  <option value="" disabled>
                    Select a topic...
                  </option>
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: "absolute",
                    right: "0.5rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "1rem",
                    height: "1rem",
                    color: "rgba(242,242,247,0.3)",
                    pointerEvents: "none",
                  }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
              {errors.subject && <p className="v6-contact-error">{errors.subject}</p>}
            </div>

            {/* Message */}
            <div className="field" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.5rem", padding: "0.875rem 1rem" }}>
              <label
                htmlFor="contact-message"
                style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(242,242,247,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}
              >
                Message
              </label>
              <textarea
                id="contact-message"
                placeholder="Tell us how we can help..."
                rows={5}
                value={message}
                onChange={(e) => { setMessage(e.target.value); setErrors((p) => ({ ...p, message: "" })); }}
              />
              {errors.message && <p className="v6-contact-error">{errors.message}</p>}
            </div>

            {/* Submit Error */}
            {submitError && (
              <p className="v6-contact-error" style={{ textAlign: "center" }}>
                {submitError}
              </p>
            )}

            {/* Submit Button */}
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ alignSelf: "flex-start" }}
            >
              {loading ? (
                <span
                  className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                  style={{ display: "inline-block", marginRight: "0.5rem" }}
                />
              ) : (
                <>
                  Send message
                  <span className="btn__icon">
                    <IconArrowUpRight />
                  </span>
                </>
              )}
            </button>
          </form>

          {/* Alternative Contact */}
          <div className="v6-contact-alt">
            <p
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "rgba(242,242,247,0.4)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "1rem",
              }}
            >
              Or reach us directly
            </p>
            <div className="v6-contact-alt-row">
              <IconMail />
              <a
                href="mailto:hello@helmies.fi"
                style={{ color: "rgba(242,242,247,0.8)", textDecoration: "none" }}
              >
                hello@helmies.fi
              </a>
            </div>
            <div className="v6-contact-alt-row">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: "1rem", height: "1rem", color: "rgba(242,242,247,0.3)", flexShrink: 0 }}
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>We typically respond within 24 hours on business days.</span>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
