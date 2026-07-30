// Direct-invoke test — bypasses HTTP auth, calls generation handler directly
const path = require("path");
process.env.DATABASE_URL = "postgresql://postgres@localhost:5433/helmies-studio";
process.env.KIE_KEY = process.env.KIE_KEY || "";

async function main() {
  console.log("=== Loading environment ===");
  require("dotenv").config({ path: "/root/helmies-studio/.env" });

  // Build a mock request
  const { NextRequest } = require("next/dist/server/web/spec-extension/request");

  const body = JSON.stringify({
    tool: "image",
    model: "nano-banana",
    prompt: "test verification - simple blue circle on white background",
    aspect_ratio: "1:1",
  });

  // Use a user who has a valid session... this won't work directly.
  // Instead, let's test via SQL + HTTP.

  console.log("This approach needs a real HTTP request with valid auth.");
  console.log("Let me use the settings page API to create a key instead.");
}

main().catch(console.error);
