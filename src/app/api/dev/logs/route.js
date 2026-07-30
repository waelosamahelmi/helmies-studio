import { execFile } from "child_process";
import { auth } from "@/lib/auth";

const DEV_EMAILS = ["waelosamahelmi@gmail.com", "wael@helmies.fi"];

// Hardcoded allowlist — `source` is passed to a process and must never be
// attacker-controlled free text (previously interpolated into a shell string).
const ALLOWED_SOURCES = new Set(["helmies-studio", "helmies-app", "helmies-bites", "all"]);
const DEFAULT_SOURCE = "helmies-studio";

function pm2Logs(source, lines) {
  return new Promise((resolve, reject) => {
    // execFile with an argv array — no shell, so no metacharacter injection.
    const args = ["logs", source, "--lines", String(lines), "--nostream", "--raw"];
    execFile("pm2", args, { timeout: 8000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const out = stdout || stderr || "";
      if (err && !out) return reject(err);
      // Filter to remove PM2 header/metadata lines
      const filtered = out
        .split("\n")
        .filter((l) => !l.startsWith("[PM2") && !l.startsWith("__"))
        .slice(-lines)
        .join("\n");
      resolve(filtered || "No logs available.");
    });
  });
}

export async function GET(req) {
  const session = await auth();
  if (!session?.user?.email || !DEV_EMAILS.includes(session.user.email)) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("source") || DEFAULT_SOURCE;
  if (!ALLOWED_SOURCES.has(requested)) {
    return Response.json({ error: "Invalid source" }, { status: 400 });
  }
  const source = requested;
  const lines = Math.min(parseInt(searchParams.get("lines")) || 100, 500);

  try {
    const logs = await pm2Logs(source, lines);
    return Response.json({ logs, source, lines });
  } catch (e) {
    return Response.json({ error: e.message, logs: "" }, { status: 500 });
  }
}
