// Helmies Studio — shared storage-state paths (Phase 5 Task 1)
//
// A plain (non-test) module so both fixtures/auth.setup.mjs (which writes
// these files) and *.spec.mjs files (which read them via
// `test.use({ storageState })`) can share the same paths without a spec
// file importing a test file — Playwright refuses that outright ("test file
// X should not import test file Y").
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, "..", ".auth");

export const USER_AUTH_FILE = path.join(AUTH_DIR, "user.json");
export const ADMIN_AUTH_FILE = path.join(AUTH_DIR, "admin.json");
