// verify-generation-pipeline.js — Tests the generation pipeline end-to-end
const crypto = require("crypto");
const http = require("http");

const RAW_KEY = "hsk_testverify_abc123";
const KEY_HASH = crypto.createHash("sha256").update(RAW_KEY).digest("hex");
const USER_ID = "cms2mxu5x00002zktspij9of5";

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  try {
    // 1. Create API key in DB
    console.log("=== 1. Creating test API key ===");
    // First delete any existing test key
    await prisma.apiKey.deleteMany({ where: { keyPrefix: "hsk_test" } }).catch(() => {});
    const key = await prisma.apiKey.create({
      data: {
        userId: USER_ID,
        name: "Verification test key",
        keyHash: KEY_HASH,
        keyPrefix: "hsk_test",
        isActive: true,
      },
    });
    console.log(`Created API key: ${key.id}`);

    // 2. Count generations before
    const beforeCount = await prisma.generation.count();
    console.log(`Generations before: ${beforeCount}`);

    // 3. Trigger generation via HTTP POST
    console.log("\n=== 3. Triggering generation ===");
    const result = await new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        tool: "image",
        model: "nano-banana",
        prompt: "test verification - simple blue circle on white background",
        aspect_ratio: "1:1",
      });

      const req = http.request(
        {
          hostname: "localhost",
          port: 3010,
          path: "/api/generate/async",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RAW_KEY}`,
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            console.log(`HTTP ${res.statusCode}`);
            console.log(`Response: ${body}`);
            try {
              resolve({ status: res.statusCode, data: JSON.parse(body) });
            } catch {
              resolve({ status: res.statusCode, data: { raw: body } });
            }
          });
        }
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    // 4. Check the generation in DB
    console.log("\n=== 4. Checking DB ===");
    await new Promise((r) => setTimeout(r, 2000));

    const latest = await prisma.generation.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, requestId: true, status: true, tool: true, model: true, createdAt: true },
    });

    console.log("Latest generation:");
    console.log(JSON.stringify(latest, null, 2));

    if (!latest.requestId) {
      console.log("\n*** FAIL: requestId is EMPTY — generation did NOT reach KIE ***");
    } else {
      console.log(`\n*** PASS: requestId = ${latest.requestId} — generation reached KIE ***`);
    }

    const afterCount = await prisma.generation.count();
    console.log(`\nGenerations after: ${afterCount} (delta: ${afterCount - beforeCount})`);

    // Cleanup test key
    await prisma.apiKey.deleteMany({ where: { keyPrefix: "hsk_test" } }).catch(() => {});

  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
