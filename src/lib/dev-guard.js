import { execFile } from "child_process";
import { auth } from "@/lib/auth";
import { requireAdminUser } from "@/lib/authz";

/* Who may operate the server.
   ────────────────────────────────────────────────────────────────────────
   Two gates, not one. The email allowlist is the original Dev-mode gate
   and stays because it is the narrowest thing we have; the admin-role
   check is added because an allowlist in source is not an authorization
   system, and both together mean a stolen session for a non-admin account
   is not enough even if its address is on the list. */
const DEV_EMAILS = ["waelosamahelmi@gmail.com", "wael@helmies.fi"];

export async function requireDeveloper(req) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !DEV_EMAILS.includes(email)) {
    const err = new Error("Not found");
    err.status = 404; // A tool nobody may use should not announce itself.
    throw err;
  }
  await requireAdminUser(req);
  return session.user;
}

/**
 * Run one allowlisted binary with an argv ARRAY.
 *
 * No shell — so there is no metacharacter to escape, and a string that
 * reaches here can never become a command. Callers pass fixed verbs and
 * validated names; nothing from a request body is ever interpolated.
 */
export function run(bin, args, { timeout = 10000, maxBuffer = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, maxBuffer }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout || "", stderr: stderr || "", error: err?.message || null });
    });
  });
}
