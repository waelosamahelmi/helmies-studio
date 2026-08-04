// EDITSv1 Phase E8 Task E8.2 — announcement delivery.
//
// Written FIRST, against behaviour that does not exist yet.
//
// The headline case is "shows INSIDE /studio". Until this phase the bar was
// rendered by src/app/layout.js in the ordinary page flow while `.st-app` is
// `position: fixed; inset: 0` — so inside /studio the announcement was in the
// DOM and completely covered by the app shell. Every announcement the owner
// ever posted was invisible to the users who were actually in the product.
// `toBeVisible()` alone would NOT have caught that (Playwright counts a
// covered element as visible), so these assertions check the element is the
// one that actually receives the click at its own centre point.
//
// ISOLATION NOTE: announcements are global rows, and playwright.config.mjs
// runs fullyParallel. A campaign left visible to everyone would float over
// every other spec's page and break unrelated clicks. Every campaign seeded
// here is therefore targeted at a plan slug unique to this test's own user
// (planTargets is non-empty, so no anonymous viewer and no other test's user
// can ever match it).
import { test, expect } from "@playwright/test";
import { withTestDb, createIsolatedUser } from "./fixtures/db.mjs";
import { loginThroughForm } from "./fixtures/login.mjs";

// React 19 streams the shell twice; interacting before the duplicate
// collapses can hit the doomed copy and silently no-op.
async function studioSettled(page) {
  await expect.poll(() => page.locator(".st-app").count(), { timeout: 20000 }).toBe(1);
}

// A user on a plan slug nobody else uses, plus the campaigns aimed at it.
async function seedCampaignsFor(label, campaigns) {
  const planSlug = `e2e-plan-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let user;
  const ids = [];
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 200, label });
    await prisma.subscription.create({
      data: { userId: user.id, plan: planSlug, status: "active" },
    });
    for (const c of campaigns) {
      const row = await prisma.siteAnnouncement.create({
        data: {
          isActive: true,
          startDate: new Date(Date.now() - 60_000),
          planTargets: [planSlug],
          ...c,
        },
      });
      ids.push(row.id);
    }
  });
  return { user, planSlug, ids };
}

async function readCampaign(id) {
  return withTestDb((prisma) => prisma.siteAnnouncement.findUnique({ where: { id } }));
}

test("a banner campaign is visible INSIDE the studio, not buried under the app shell", async ({ page }) => {
  const message = `Studio visibility check ${Date.now()}`;
  const { user } = await seedCampaignsFor("annbanner", [
    { message, placement: "banner", style: "info" },
  ]);

  await loginThroughForm(page, user);
  await page.goto("/studio");
  await studioSettled(page);

  const banner = page.getByRole("region", { name: "Site announcement" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(message);

  // THE REGRESSION GUARD. `.st-app` is a fixed, full-viewport layer; the old
  // statically-positioned bar sat underneath it. An element that is painted
  // but unreachable is not "shown" to anyone — so assert the announcement is
  // genuinely the topmost thing at its own centre.
  const reachable = await banner.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (el === hit || el.contains(hit));
  });
  expect(reachable, "the announcement is covered by another layer — this is the /studio invisibility bug").toBe(true);
});

test("the same banner is visible on an ordinary page too", async ({ page }) => {
  const message = `Everywhere check ${Date.now()}`;
  const { user } = await seedCampaignsFor("anneverywhere", [
    { message, placement: "banner", style: "success" },
  ]);

  await loginThroughForm(page, user);
  await page.goto("/gallery");

  const banner = page.getByRole("region", { name: "Site announcement" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(message);
});

test("style variants render differently instead of all looking the same", async ({ page }) => {
  const message = `Critical notice ${Date.now()}`;
  const { user } = await seedCampaignsFor("annstyle", [
    { message, placement: "banner", style: "critical" },
  ]);

  await loginThroughForm(page, user);
  await page.goto("/studio");
  await studioSettled(page);

  const banner = page.getByRole("region", { name: "Site announcement" });
  await expect(banner).toBeVisible();
  // Before E8 the style string was printed raw into a badge and every
  // variant was pixel-identical.
  await expect(banner).toHaveClass(/hs-announce--critical/);
});

test("a modal campaign opens for a signed-in user and stays dismissed after a reload", async ({ page }) => {
  const title = `Popup ${Date.now()}`;
  const { user, ids } = await seedCampaignsFor("annmodal", [
    { message: "A thing worth interrupting for.", title, placement: "modal", style: "info" },
  ]);

  await loginThroughForm(page, user);
  await page.goto("/studio");
  await studioSettled(page);

  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();

  // An impression is recorded the first time it is actually shown.
  await expect
    .poll(async () => (await readCampaign(ids[0])).impressions, { timeout: 10000 })
    .toBeGreaterThanOrEqual(1);

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();

  // The dismissal must live in the database, not only in localStorage —
  // otherwise the popup returns on the user's next device.
  await page.reload();
  await studioSettled(page);
  await expect(page.getByRole("dialog", { name: title })).toBeHidden();

  const dismissals = await withTestDb((prisma) =>
    prisma.announcementDismissal.findMany({ where: { announcementId: ids[0] } }),
  );
  expect(dismissals).toHaveLength(1);
});

test("an anon-targeted campaign never reaches a signed-in user, while an authed-targeted one does", async ({ page }) => {
  const anonMessage = `Anon only ${Date.now()}`;
  const authedMessage = `Members only ${Date.now()}`;
  const { user } = await seedCampaignsFor("annaudience", [
    { message: anonMessage, placement: "banner", audience: "anon", priority: 10 },
    { message: authedMessage, placement: "banner", audience: "authed", priority: 5 },
  ]);

  await loginThroughForm(page, user);
  await page.goto("/studio");
  await studioSettled(page);

  const banner = page.getByRole("region", { name: "Site announcement" });
  await expect(banner).toBeVisible();
  // Paired assertion: the anon campaign carries the HIGHER priority, so if
  // the audience filter were still ignored (as it was before E8) it is the
  // one that would win the slot.
  await expect(banner).toContainText(authedMessage);
  await expect(page.getByText(anonMessage)).toHaveCount(0);
});

test("activating the CTA records a click against the campaign", async ({ page }) => {
  const message = `Click me ${Date.now()}`;
  const { user, ids } = await seedCampaignsFor("annclick", [
    { message, placement: "banner", ctaLabel: "See the models", ctaUrl: "/models" },
  ]);

  await loginThroughForm(page, user);
  await page.goto("/studio");
  await studioSettled(page);

  const banner = page.getByRole("region", { name: "Site announcement" });
  await expect(banner).toBeVisible();
  expect((await readCampaign(ids[0])).clicks).toBe(0);

  await banner.getByRole("link", { name: "See the models" }).click();
  await expect(page).toHaveURL(/\/models/);

  await expect
    .poll(async () => (await readCampaign(ids[0])).clicks, { timeout: 10000 })
    .toBe(1);
});

test("dismissing a banner keeps it gone after a reload for a signed-in user", async ({ page }) => {
  const message = `Dismiss me ${Date.now()}`;
  const { user, ids } = await seedCampaignsFor("anndismiss", [
    { message, placement: "banner" },
  ]);

  await loginThroughForm(page, user);
  await page.goto("/studio");
  await studioSettled(page);

  const banner = page.getByRole("region", { name: "Site announcement" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Dismiss announcement" }).click();
  await expect(banner).toBeHidden();

  await expect
    .poll(
      async () =>
        (await withTestDb((prisma) =>
          prisma.announcementDismissal.findMany({ where: { announcementId: ids[0] } }),
        )).length,
      { timeout: 10000 },
    )
    .toBe(1);

  await page.reload();
  await studioSettled(page);
  await expect(page.getByRole("region", { name: "Site announcement" })).toBeHidden();
});

test("a non-dismissible campaign offers no dismiss control", async ({ page }) => {
  const message = `Cannot be closed ${Date.now()}`;
  const { user } = await seedCampaignsFor("annsticky", [
    { message, placement: "banner", dismissible: false, style: "warning" },
  ]);

  await loginThroughForm(page, user);
  await page.goto("/studio");
  await studioSettled(page);

  const banner = page.getByRole("region", { name: "Site announcement" });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("button", { name: "Dismiss announcement" })).toHaveCount(0);
});

test("the public endpoint answers anonymous callers without leaking an internal error message", async ({ request }) => {
  const res = await request.get("/api/announcements");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
  // Per-viewer targeting means this response must never be shared by a cache.
  expect(res.headers()["cache-control"]).toMatch(/private/);
  expect(res.headers()["cache-control"]).toMatch(/no-store/);
});
