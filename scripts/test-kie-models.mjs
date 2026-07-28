import { config } from "dotenv";
config();

const key = process.env.KIE_KEY;

// Try common KIE model listing endpoints
for (const endpoint of ["/api/v1/models", "/v1/models", "/api/models", "/openai/v1/models"]) {
  try {
    const res = await fetch(`https://api.kie.ai${endpoint}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    console.log(`\n=== ${endpoint} → ${res.status} ===`);
    if (res.ok) {
      const text = await res.text();
      // Try to parse and extract model IDs
      try {
        const json = JSON.parse(text);
        const data = json.data || json.models || json;
        if (Array.isArray(data)) {
          const ids = data.map(m => m.id || m.modelId || m.name).filter(Boolean);
          console.log("Models:", ids.slice(0, 30).join(", "));
          // Show any that contain "gemini"
          const gemini = ids.filter(id => id.toLowerCase().includes("gemini"));
          if (gemini.length) console.log("Gemini models:", gemini.join(", "));
        } else {
          console.log("Body:", text.substring(0, 500));
        }
      } catch {
        console.log("Body:", text.substring(0, 500));
      }
    } else {
      const text = await res.text();
      console.log("Error:", text.substring(0, 200));
    }
  } catch (e) {
    console.log(`\n=== ${endpoint} → ERROR: ${e.message} ===`);
  }
}

// Also try a simple model to see if the API works at all
console.log("\n=== TEST: gemini-2.5-flash (without google/ prefix) ===");
const res = await fetch("https://api.kie.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({
    model: "gemini-2.5-flash",
    messages: [{ role: "user", content: "Say hello" }],
    max_tokens: 50,
    stream: false,
  }),
});
console.log("Status:", res.status);
console.log("Body:", (await res.text()).substring(0, 300));