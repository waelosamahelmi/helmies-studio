# Model Operations

## When to use
When adding, removing, or modifying AI models in the platform.

## Model Registry
- **Catalog**: `lib/models.js` — model definitions, capability tags, resolution tiers, pricing
- **Gateway**: `lib/providers.js` — Model Gateway abstraction (WaveSpeed + KIE unified API)
- **DB Schema**: `prisma/schema.prisma` — `Model` table for active model configs

## Adding a New Model
1. Add model definition to `lib/models.js` MODEL_CATALOG:
   ```js
   { id: "provider/model-id", name: "Display Name", provider: "PROVIDER", type: "image|video|llm", capabilities: ["txt2img"], tiers: [{ name: "1K", price: 10 }] }
   ```
2. Ensure provider supports it in `lib/providers.js`
3. If needed, add to DB via admin panel or seed script
4. Test with a generation request

## Model Capability Tags
- `txt2img` — Text-to-image generation
- `img2img` — Image-to-image / editing
- `txt2vid` — Text-to-video
- `img2vid` — Image-to-video
- `llm` — Language model / chat
- `upscale` — Image upscaling

## Resolution Tiers
- Tier names are case-insensitive in normalization (handles both "1k" and "1K")
- Common tiers: "1K", "2K", "4K", "HD"
- Prices are in credits (NOT dollars — conversion handled by credit-packs.js)
