import { exec } from "child_process";
import { auth } from "@/lib/auth";

const DEV_EMAILS = ["waelosamahelmi@gmail.com", "wael@helmies.fi"];

function pm2Logs(source = "helmies-studio", lines = 100) {
  return new Promise((resolve, reject) => {
    exec(`pm2 logs ${source} --lines ${lines} --nostream --raw 2>&1`, { timeout: 8000 }, (err, stdout) => {
      if (err && !stdout) return reject(err);
      // Filter to remove PM2 header/metadata lines
      const filtered = (stdout || "")
        .split("\n")
        .filter(l => !l.startsWith("[PM2") && !l.startsWith("__"))
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
  const source = searchParams.get("source") || "helmies-studio";
  const lines = Math.min(parseInt(searchParams.get("lines")) || 100, 500);

  try {
    const logs = await pm2Logs(source, lines);
    return Response.json({ logs, source, lines });
  } catch (e) {
    return Response.json({ error: e.message, logs: "" }, { status: 500 });
  }
}
