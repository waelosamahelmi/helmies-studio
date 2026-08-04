// EDITSv1 Phase E3 Task E3.6 — agent sessions: implicit creation +
// auto-title, resume-after-reload with full history, "New session"
// emptying the feed, and cross-user isolation (another user's session id
// 404s exactly like a missing one).
//
// These journeys use the REAL /api/agent/chat route (no page.route stub —
// persistence happens server-side, and with no OPENROUTER_KEY in the e2e
// app the route streams its deterministic no-LLM fallback reply without
// any network call).
import { test, expect } from "@playwright/test";
import { withTestDb, createIsolatedUser } from "./fixtures/db.mjs";
import { loginThroughForm } from "./fixtures/login.mjs";

const visible = (locator) => locator.and(locator.page().locator(":visible"));
const brief = (page) => visible(page.getByLabel("Creative brief"));

async function gotoAgent(page) {
  await page.goto("/studio/orchestrator");
  await expect(page.locator(".st-talk:visible")).toBeVisible();
  // React 19's streaming SSR briefly renders the page TWICE (documented in
  // fixtures/studio-actions.mjs and smoke.spec.mjs) — one copy survives,
  // the other is a doomed duplicate whose handlers are already detached.
  // `:visible` alone isn't enough: during the reconciliation flash a
  // fill()/press() can still land on the copy that's about to be dropped,
  // silently no-op'ing the interaction. Wait for the duplicate to be fully
  // removed from the DOM (count collapses to 1) before touching anything.
  // NOTE: do not gate this on the credits pill instead — on the agent
  // surface it can legitimately read "—cr", so that guard would hang.
  await expect.poll(() => page.locator(".st-talk").count(), { timeout: 20000 }).toBe(1);
}

async function readyIsolated(page, label) {
  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label });
  });
  await loginThroughForm(page, user);
  await gotoAgent(page);
  return user;
}

async function sendAndAwaitReply(page, text) {
  await brief(page).fill(text);
  await brief(page).press("Enter");
  // The user's bubble, then the (fallback) assistant reply — both persisted
  // server-side before the stream closes.
  await expect(visible(page.locator(".st-msg--user")).filter({ hasText: text })).toBeVisible();
  await expect(visible(page.locator(".st-msg--agent .st-md"))).toBeVisible({ timeout: 15000 });
}

test("a sent message survives reload: the session is listed, titled, and resumes with history", async ({ page }) => {
  await readyIsolated(page, "sess");
  const marker = `Session resume proof ${Date.now()}`;

  await sendAndAwaitReply(page, marker);

  // Reload from scratch — the feed is empty, but the rail lists the
  // session, auto-titled from the first user message (60 chars).
  await gotoAgent(page);
  const rail = visible(page.locator(".st-sessions"));
  const entry = rail.locator(".st-sessions__item", { hasText: marker.slice(0, 40) });
  await expect(entry).toBeVisible({ timeout: 15000 });

  // Resume: the full stored history re-renders.
  await entry.click();
  await expect(visible(page.locator(".st-msg--user")).filter({ hasText: marker })).toBeVisible({ timeout: 15000 });
  await expect(visible(page.locator(".st-msg--agent"))).toBeVisible();
});

test("New session empties the feed and starts a separate conversation", async ({ page }) => {
  await readyIsolated(page, "sessnew");
  const first = `First conversation ${Date.now()}`;

  await sendAndAwaitReply(page, first);

  await visible(page.getByRole("button", { name: "New session" })).click();

  // The feed is empty again (the composer's empty state returns).
  await expect(visible(page.locator(".hs-empty"))).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".st-msg--user")).toHaveCount(0);

  // The old conversation is still in the rail; the new one is current.
  await expect(visible(page.locator(".st-sessions__item", { hasText: first.slice(0, 40) }))).toBeVisible();

  const second = `Second conversation ${Date.now()}`;
  await sendAndAwaitReply(page, second);
  await expect(visible(page.locator(".st-msg--user")).filter({ hasText: first })).toHaveCount(0);
});

test("another user's session 404s — indistinguishable from a missing one", async ({ page, browser }) => {
  const owner = await readyIsolated(page, "sessown");
  const marker = `Private session ${Date.now()}`;
  await sendAndAwaitReply(page, marker);

  let sessionRow;
  await withTestDb(async (prisma) => {
    sessionRow = await prisma.agentSession.findFirst({
      where: { userId: owner.id },
      orderBy: { updatedAt: "desc" },
    });
  });
  expect(sessionRow, "the chat turn must have created a session").not.toBeNull();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  try {
    let intruder;
    await withTestDb(async (prisma) => {
      intruder = await createIsolatedUser(prisma, { credits: 100, label: "sessspy" });
    });
    await loginThroughForm(pageB, intruder);

    const foreign = await pageB.request.get(`/api/agent/sessions/${sessionRow.id}`);
    expect(foreign.status()).toBe(404);
    const missing = await pageB.request.get(`/api/agent/sessions/nonexistent-session-id`);
    expect(missing.status()).toBe(404);

    // And the intruder's rail never lists it.
    await gotoAgent(pageB);
    await expect(pageB.locator(".st-sessions__item", { hasText: marker.slice(0, 40) })).toHaveCount(0);
  } finally {
    await contextB.close();
  }
});
