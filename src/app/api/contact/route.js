import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";

/* The contact form previously posted to this path, which did not exist —
   every message returned 404 and was lost. There is no mail transport in this
   deployment, so messages are persisted and read from the admin panel. */

const MAX = { name: 120, email: 200, subject: 200, message: 5000 };

const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

export async function POST(req) {
  try {
    const user = await getCurrentUser(req).catch(() => null);

    // Keyed by user when signed in, by IP otherwise — the form is public.
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const rl = await checkRateLimit(user?.id || `ip:${ip}`, "/api/contact");
    if (rl && rl.allowed === false) {
      return NextResponse.json(
        { error: "Too many messages. Try again in a few minutes." },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Name, email and message are all required." },
        { status: 400 },
      );
    }
    if (!looksLikeEmail(email)) {
      return NextResponse.json({ error: "That email address is not valid." }, { status: 400 });
    }
    for (const [field, limit] of Object.entries(MAX)) {
      const value = { name, email, subject, message }[field];
      if (value.length > limit) {
        return NextResponse.json(
          { error: `${field[0].toUpperCase()}${field.slice(1)} is too long (max ${limit}).` },
          { status: 400 },
        );
      }
    }

    await prisma.contactMessage.create({
      data: {
        name,
        email,
        subject: subject || null,
        message,
        userId: user?.id || null,
        ip: ip === "unknown" ? null : ip,
        userAgent: req.headers.get("user-agent")?.slice(0, 500) || null,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Thanks — we have your message and will reply to that address.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Could not send the message." },
      { status: 500 },
    );
  }
}
