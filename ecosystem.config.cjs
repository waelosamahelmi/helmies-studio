// PM2 process manifest — Helmies Studio (Phase 4A Task 4).
//
// Declares BOTH long-running processes this deploy owns, so a single
// `pm2 startOrReload ecosystem.config.cjs --update-env` (scripts/deploy.sh)
// brings both up/reloads both together instead of the app being restarted
// on its own and the worker being a separate, easy-to-forget step.
//
// "helmies-studio" — the Next.js app. Command matches how it runs in
// production today (see scripts/deploy.sh's prior `pm2 restart helmies-studio`
// and the app's own `npm start -- -p 3010`) — unchanged by this file, only
// now declared here instead of only ever created ad hoc on the server.
//
// "helmies-worker" — the durable generation job queue drain loop
// (scripts/worker.mjs, Phase 4A). Runs `node` directly (no npm wrapper) —
// see scripts/worker.mjs's header for why it uses plain relative imports
// instead of the app's "@/..." alias. `max_restarts`/`restart_delay` bound
// a crash-loop (e.g. a bad deploy that breaks the worker's imports) so PM2
// gives up escalating restarts every 5s forever — it still leaves the
// process down for `pm2 logs helmies-worker` triage rather than pegging the
// CPU (see docs/runbook-jobs.md).
module.exports = {
  apps: [
    {
      name: "helmies-studio",
      script: "npm",
      args: "start -- -p 3010",
      cwd: "/root/helmies-studio",
      env: { NODE_ENV: "production" },
    },
    {
      name: "helmies-worker",
      script: "scripts/worker.mjs",
      cwd: "/root/helmies-studio",
      env: { NODE_ENV: "production" },
      max_restarts: 20,
      restart_delay: 5000,
    },
  ],
};
