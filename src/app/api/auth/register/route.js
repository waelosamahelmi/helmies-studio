import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { provisionNewUser } from "@/lib/auth-events";
import { checkAnonLimit, clientIp } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Durable per-IP rate limit (Phase 3 Task 4). The shared checkRateLimit
// helper in lib/security.js is user-scoped (FK to User) so it cannot protect
// anonymous registration; this caps sign-up attempts per IP via the
// AnonRateLimit table instead — same 10 attempts / 10 min as before, but
// surviving restarts and shared across instances.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export async function POST(req) {
  const ip = clientIp(req);
  const rl = await checkAnonLimit(ip, "/api/auth/register", { windowMs: WINDOW_MS, max: MAX_ATTEMPTS });
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "Please enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ ok: false, error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userCount = await prisma.user.count();
  const role = userCount === 0 ? "admin" : "user";

  // user.create + provisionNewUser run as one transaction: if provisioning
  // (subscription upsert / wallet grant) throws mid-way, the User row rolls
  // back too, instead of leaving an orphaned, walletless user that then
  // blocks the same email from ever registering again (409 on retry).
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        name: name || null,
        passwordHash,
        role,
        emailVerified: new Date(),
      },
      select: { id: true },
    });

    // Role is already computed above from the pre-create user count, so this
    // path never needs provisionNewUser's own admin promotion.
    await provisionNewUser(created.id, { firstUserAdmin: false }, tx);
    return created;
  });

  return NextResponse.json({ ok: true, userId: user.id });
}
