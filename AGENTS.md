# Helmies Studio — OpenCode Agent Rules

## Project Identity
- **Production URL**: https://studio.helmies.fi (Nginx reverse proxy → PM2 `helmies-studio` on port 3010)
- **Stack**: Next.js 16.2 (App Router), React 19, Framer Motion, Tailwind CSS 4, Prisma 7.8 + PostgreSQL (PrismaPg adapter, port 5433), NextAuth v5, Stripe
- **Monorepo**: Single-app — no `apps/` split, no LibreChat
- **Deployment**: Push to `main` → `git pull` on server → `npm run build` → `pm2 restart helmies-studio --update-env`

## Build & Test Commands
```bash
npm run build          # Production build (always run before pm2 restart)
npm run dev            # Dev server on port 3000
npx prisma generate    # Regenerate Prisma client after schema changes
npx prisma db push     # Push schema changes to DB (port 5433)
pm2 restart helmies-studio --update-env  # Restart production
pm2 logs helmies-studio --lines 50       # Check logs
```

## Architecture

### Key Files & Directories
```
src/
├── app/api/           # All API routes (App Router)
├── app/studio/        # Main studio UI (client component entry)
├── components/studio/ # Studio-specific components (MasonryGrid, tool panels)
├── components/admin/  # Admin panel components
├── components/landing/# Landing page components
├── lib/               # Core business logic (see below)
└── styles/            # globals.css + studio-premium.css

prisma/schema.prisma   # DB schema — single source of truth
config/nginx/          # Nginx config (deployed to /etc/nginx/sites-enabled/)
scripts/               # Utility scripts (seed, generate-icons, etc.)
```

### Core Lib Modules (src/lib/)
| File | Purpose |
|------|---------|
| `prisma.js` | Prisma client singleton |
| `auth.js` | NextAuth v5 config |
| `session.js` | User session + credit sync |
| `wallet.js` | `CreditWallet` (available+reserved) + `CreditLedger` + `CreditReservation` |
| `credits.js` | Credit cost calculation per model/tier |
| `generation-handler.js` | Reserve → execute → settle/release credit flow |
| `providers.js` | Model Gateway abstraction (WaveSpeed + KIE unified API) |
| `models.js` | Model catalog, capability filtering, resolution tiers |
| `generation.js` | Core generation orchestration |
| `media-storage.js` | S3/local media storage abstraction |
| `director-planner.js` + `director-executor.js` | Multi-step generation planning |
| `prompt-expansion.js` | Prompt enhancement pipeline |
| `quality-gate.js` | Output quality validation |
| `brand-engine.js` | Brand kit generation |
| `canvas-compiler.js` | Canvas compilation |
| `video-assembly.js` | Video frame assembly |
| `agents.js` | Agent system definitions |
| `workflows.js` | Workflow engine |
| `memory.js` | Agent memory system |
| `security.js` | API key auth, rate limiting |

### Credit System (Post-Phase 2)
- `lib/wallet.js` is authoritative — `User.credits` is a denormalized mirror only
- `session.js` keeps `User.credits` synced via `syncUserCredits()`
- `generation-handler.js` does reserve → settle/release (not debit-then-manual-refund)
- `debitCredits`/`creditUser` in `session.js` still exist for synchronous paths

### API Pattern
- All API routes use App Router handlers in `src/app/api/*/route.js`
- NextAuth session via `getServerSession(authOptions)` or `requireAdmin()` for admin routes
- Media generation goes through KIE API (`createTask` async pattern)
- LLM chat routes through OpenRouter (provider: DeepSeek V4 Flash)

## Key Conventions
- **Import style**: ES modules with `import`/`export`
- **`"use client"` directive** required for all client components
- **Auth**: `requireAdmin()` middleware wraps all `/api/admin/*` routes
- **CORS**: Handled in `middleware.js` at root
- **Environment**: `.env` on server (NOT committed) — keys include `KIE_KEY`, `OPENROUTER_KEY`, `DATABASE_URL`, Stripe keys
- **No TypeScript**: Pure JavaScript with JSDoc where helpful (jsconfig.json for path aliases)

## Known Gotchas
- Resolution tiers in `models.js` are inconsistent ("1k" vs "1K") — code normalizes case-insensitive
- `api/agent/chat/route.js` hand-rolls KIE `/chat/completions` — do NOT import PROVIDERS there
- Canvas models were previously `slice(0,8)` — now capability-filtered from I2I+IMAGE models
- Prisma runs on port 5433 (PrismaPg adapter), not default 5432
- PM2 process name is `helmies-studio` (exact case)

## Agent Chat Pipeline
- Endpoint: `POST /api/agent/chat`
- Provider: OpenRouter → DeepSeek V4 Flash (cheapest)
- Fallback: KIE OpenAI-compatible endpoint
- Tools: memory search, brand kit lookup, generation dispatch
- Credit check happens before generation dispatch

## Dev Tools (Internal)
- **DevMode** (src/components/DevMode.js): Draggable button → side panel with Terminal (ttyd:3090), Opencode AI (opencode web:3095), Hermes agent dashboard
- **ttyd**: Web terminal on port 3090, tmux session `dev-terminal`, proxied at `/dev-terminal`
- **opencode-ai**: v1.18.9 on port 3095, `/dev-opencode` proxy, MCP browser on 3099
- **Hermes Agent**: v0.17.0 on port 9119 (SSH tunnel only)
- **Playwright MCP**: Browser automation on port 3099 for opencode + hermes
