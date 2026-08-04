// EDITSv1 Phase E8 Task E8.3 — the owner's control over campaigns.
//
// Written FIRST. What exists today is create / toggle-live / delete and
// nothing else: there is NO edit at all (a typo means delete and retype),
// no duplicate, no placement, no plan targeting, no CTA, no priority, and
// no way to tell whether a promotion was ever seen. The admin PATCH route
// accepts {message, style, link, isActive, endDate} that no caller sends.
//
// The journey below is the one that matters: the owner writes something,
// a real user sees it, the owner fixes the wording, the same user sees the
// fix, the owner switches it off and it is gone.
//
// ISOLATION: every campaign created here is targeted at a plan slug unique
// to this spec's own user, so it can never float over another spec's page
// (playwright.config.mjs runs fullyParallel).
import { test, expect } from "@playwright/test";
import { ADMIN_AUTH_FILE } from "./fixtures/storage-state.mjs";
import { withTestDb, createIsolatedUser } from "./fixtures/db.mjs";
import { loginThroughForm } from "./fixtures/login.mjs";

test.use({ storageState: ADMIN_AUTH_FILE });

async function userOnPlan(planSlug, label) {
  return withTestDb(async (prisma) => {
    const user = await createIsolatedUser(prisma, { credits: 100, label });
    await prisma.subscription.create({ data: { userId: user.id, plan: planSlug, status: "active" } });
    return user;
  });
}

async function campaignByMessage(message) {
  return withTestDb((prisma) => prisma.siteAnnouncement.findFirst({ where: { message } }));
}

// The campaign's row in the admin table. Scoped to the row rather than a
// cell because the message text deliberately appears three times in a row —
// the message cell, the live switch's accessible name, and the Edit
// button's — and asserting there is exactly ONE row is the stronger claim.
const rowFor = (page, message) => page.getByRole("row").filter({ hasText: message });

// A fresh signed-in browser for the ordinary user, kept separate from the
// admin's storageState on `page`.
async function asUser(browser, user, path) {
  const context = await browser.newContext({ storageState: undefined });
  const userPage = await context.newPage();
  await loginThroughForm(userPage, user);
  await userPage.goto(path);
  return { context, userPage };
}

test("the owner creates a campaign, a real user sees it, editing changes what they see, switching it off hides it", async ({
  page,
  browser,
}) => {
  const stamp = Date.now();
  const planSlug = `e2e-plan-admin-${stamp}`;
  const original = `Owner wrote this ${stamp}`;
  const corrected = `Owner corrected this ${stamp}`;

  const user = await userOnPlan(planSlug, "adminann");

  // ── The owner publishes ────────────────────────────────────────────────
  await page.goto("/admin?section=announcements");
  // level: 1 — the page heading, not the "Announcements" panel heading below it.
  await expect(page.getByRole("heading", { level: 1, name: "Announcements" })).toBeVisible();

  await page.getByLabel("Message", { exact: true }).fill(original);
  await page.getByLabel("Plan targets").fill(planSlug);
  await page.getByRole("button", { name: "Publish announcement" }).click();

  await expect(rowFor(page, original)).toHaveCount(1);

  // ── A real user sees it ────────────────────────────────────────────────
  const { context, userPage } = await asUser(browser, user, "/gallery");
  const banner = userPage.getByRole("region", { name: "Site announcement" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(original);

  // ── The owner fixes the wording — this is what did not exist before ────
  await page.getByRole("button", { name: `Edit ${original}` }).click();
  const editor = page.getByRole("dialog", { name: "Edit announcement" });
  await expect(editor).toBeVisible();
  await editor.getByLabel("Message", { exact: true }).fill(corrected);
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor).toBeHidden();
  await expect(rowFor(page, corrected)).toHaveCount(1);

  // ── The same user sees the correction ──────────────────────────────────
  await userPage.reload();
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(corrected);
  await expect(userPage.getByText(original)).toHaveCount(0);

  // ── The owner switches it off ──────────────────────────────────────────
  await page.getByRole("switch", { name: new RegExp(corrected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  await expect
    .poll(async () => (await campaignByMessage(corrected))?.isActive, { timeout: 10000 })
    .toBe(false);

  await userPage.reload();
  await expect(userPage.getByRole("region", { name: "Site announcement" })).toBeHidden();

  await context.close();
});

test("the owner can set placement, audience, priority, CTA and a schedule, and preview before publishing", async ({
  page,
}) => {
  const stamp = Date.now();
  const planSlug = `e2e-plan-fields-${stamp}`;
  const message = `Full field set ${stamp}`;
  const title = `Big news ${stamp}`;

  await page.goto("/admin?section=announcements");

  await page.getByLabel("Message", { exact: true }).fill(message);
  // Several labels carry an inline qualifier ("Title (popups only)"), which
  // is part of the accessible name — match on the leading text.
  await page.getByLabel(/^Title/).fill(title);
  await page.getByLabel("Placement").selectOption("modal");
  await page.getByLabel("Style").selectOption("warning");
  await page.getByLabel("Audience").selectOption("authed");
  await page.getByLabel("Plan targets").fill(planSlug);
  await page.getByLabel(/^Button label/).fill("See the plans");
  await page.getByLabel("Button link").fill("/pricing");
  await page.getByLabel("Priority").fill("7");

  // The preview is the point: the owner should not have to publish to a
  // live site to find out what a campaign looks like.
  const preview = page.getByRole("region", { name: "Campaign preview" });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText(message);
  await expect(preview).toContainText(title);
  await expect(preview).toContainText("See the plans");
  await expect(preview).toContainText(/popup/i);

  await page.getByRole("button", { name: "Publish announcement" }).click();
  await expect(rowFor(page, message)).toHaveCount(1);

  const row = await campaignByMessage(message);
  expect(row.placement).toBe("modal");
  expect(row.style).toBe("warning");
  expect(row.audience).toBe("authed");
  expect(row.planTargets).toEqual([planSlug]);
  expect(row.ctaLabel).toBe("See the plans");
  expect(row.ctaUrl).toBe("/pricing");
  expect(row.priority).toBe(7);
});

test("duplicating a campaign copies its settings and leaves the copy switched off", async ({ page }) => {
  const stamp = Date.now();
  const planSlug = `e2e-plan-dup-${stamp}`;
  const message = `Duplicate me ${stamp}`;

  await page.goto("/admin?section=announcements");
  await page.getByLabel("Message", { exact: true }).fill(message);
  await page.getByLabel("Style").selectOption("success");
  await page.getByLabel("Plan targets").fill(planSlug);
  await page.getByLabel("Priority").fill("3");
  await page.getByRole("button", { name: "Publish announcement" }).click();
  await expect(rowFor(page, message)).toHaveCount(1);

  await page.getByRole("button", { name: `Duplicate ${message}` }).click();

  const copyMessage = `${message} (copy)`;
  await expect(rowFor(page, copyMessage)).toHaveCount(1);

  const copy = await campaignByMessage(copyMessage);
  expect(copy.style).toBe("success");
  expect(copy.planTargets).toEqual([planSlug]);
  expect(copy.priority).toBe(3);
  // A duplicate that went live the instant it was created would be a
  // genuinely dangerous button.
  expect(copy.isActive).toBe(false);
});

test("the owner can see how a campaign performed — impressions, clicks and dismissals", async ({ page }) => {
  const stamp = Date.now();
  const message = `Measured campaign ${stamp}`;

  const { id } = await withTestDb(async (prisma) => {
    const user = await createIsolatedUser(prisma, { credits: 10, label: "annmetrics" });
    const row = await prisma.siteAnnouncement.create({
      data: {
        message,
        isActive: true,
        planTargets: [`e2e-plan-metrics-${stamp}`],
        impressions: 42,
        clicks: 7,
      },
    });
    await prisma.announcementDismissal.create({ data: { announcementId: row.id, userId: user.id } });
    return row;
  });
  expect(id).toBeTruthy();

  await page.goto("/admin?section=announcements");
  const row = rowFor(page, message);
  await expect(row).toBeVisible();

  // Assert the specific metric cells, not "the row contains a 1 somewhere" —
  // the message itself carries a timestamp full of digits, so a loose
  // containText here would pass no matter what the numbers were.
  // Columns: Message · Placement · Who · Window · Seen · Clicks · Closed · Live · actions
  const cells = row.getByRole("cell");
  await expect(cells.nth(4)).toHaveText("42"); // impressions
  await expect(cells.nth(5)).toHaveText("7");  // clicks
  await expect(cells.nth(6)).toHaveText("1");  // dismissals — one was recorded above
});

test("an empty message is refused instead of publishing a blank bar", async ({ page }) => {
  await page.goto("/admin?section=announcements");
  await page.getByRole("button", { name: "Publish announcement" }).click();
  await expect(page.getByText("Write the line people will read.")).toBeVisible();
});
