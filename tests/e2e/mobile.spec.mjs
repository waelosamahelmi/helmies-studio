// Helmies Studio — phone-viewport coverage (EDITSv1 E7.1)
//
// The first mobile testing this suite has ever had. It runs ONLY under the
// "mobile" project (playwright.config.mjs), which uses devices["Pixel 5"] —
// 393x851, `hasTouch`, `isMobile`. That matters: a desktop project calling
// setViewportSize({ width: 393 }) narrows the layout but still reports
// `pointer: fine` and `hover: hover`, so every `@media (pointer: coarse)`
// rule in system.css stays switched off and a green run would prove nothing
// about a real phone.
//
// Four families of assertion, all measured rather than asserted by eye:
//   (a) the page never scrolls sideways;
//   (b) every interactive control is at least 44x44 CSS px — the rule
//       src/styles/system.css's own header states ("Every interactive target
//       >= 44px on coarse pointers") and WCAG 2.5.5's Target Size (Enhanced)
//       threshold. Offenders are reported by selector so the list is
//       actionable, not just a count;
//   (c) the agent's session context — balance, Clear conversation, the
//       latest plan and the produced outputs — is reachable at all (today
//       .st-talk__side is display:none at <=1024 with no replacement);
//   (d) icon-only action buttons name themselves on touch, where tooltips
//       (system.css's `@media (hover: hover) and (pointer: fine)`) never
//       fire.
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { USER_AUTH_FILE, ADMIN_AUTH_FILE } from "./fixtures/storage-state.mjs";
import { withTestDb, createIsolatedUser } from "./fixtures/db.mjs";
import { loginThroughForm } from "./fixtures/login.mjs";

const TAP_MIN = 44;

function visible(locator) {
  return locator.and(locator.page().locator(":visible"));
}

// React 19 streams the resolved shell twice while a page settles; the doomed
// copy is a partial tree whose half-laid-out controls would read as bogus
// tap-target offenders, and an interaction landing on it is silently dropped
// (see fixtures/studio-actions.mjs). Wait for the duplicate to collapse.
async function settleApp(page, root = ".st-app") {
  await expect(visible(page.locator(root))).toBeVisible({ timeout: 20000 });
  await expect.poll(() => page.locator(root).count(), { timeout: 20000 }).toBe(1);
}

/* ── (a) horizontal overflow ────────────────────────────────────────────── */
async function horizontalOverflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    // The widest element that sticks out past the viewport, so a failure
    // names the culprit instead of just the number.
    widest: (() => {
      let worst = null;
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const over = Math.round(r.right - window.innerWidth);
        if (over > 1 && (!worst || over > worst.over)) {
          worst = {
            over,
            where: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${
              el.className && typeof el.className === "string"
                ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
                : ""
            }`,
          };
        }
      }
      return worst;
    })(),
  }));
}

async function expectNoHorizontalScroll(page, label) {
  const { scrollWidth, innerWidth, widest } = await horizontalOverflow(page);
  expect(
    scrollWidth,
    `${label} scrolls sideways: documentElement.scrollWidth=${scrollWidth} > innerWidth=${innerWidth}` +
      (widest ? ` — widest overflowing element: ${widest.where} (+${widest.over}px)` : ""),
  ).toBeLessThanOrEqual(innerWidth + 1);
}

/* ── (b) tap targets ────────────────────────────────────────────────────── */
// Enumerates every visible interactive control and reports the ones whose
// own border box is smaller than 44x44.
//
// One documented exception, WCAG 2.5.8's own: a target whose computed
// `display` is `inline` is a link sized by the sentence it sits in, and
// growing it would break the prose. Everything the app lays out as a control
// (block, flex/grid item, inline-flex, inline-block, ...) is in scope. The
// measurement is the element's OWN box on purpose — a hit area faked with an
// absolutely-positioned ::before does not move under a fingertip in a
// scrolling list the way a real box does, so a fix has to grow the box.
async function tapTargetOffenders(page, min) {
  return page.evaluate((floor) => {
    const describe = (el) => {
      const cls =
        el.className && typeof el.className === "string"
          ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
          : "";
      const name =
        el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 28) || el.getAttribute("type") || "";
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls}${name ? ` "${name}"` : ""}`;
    };

    const out = [];
    for (const el of document.querySelectorAll(
      "button, a, input, select, [role=button], [role=switch]",
    )) {
      const shown =
        typeof el.checkVisibility === "function"
          ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
          : el.getClientRects().length > 0;
      if (!shown) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "inline") continue; // WCAG 2.5.8 inline exception
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width * 10) / 10;
      const h = Math.round(r.height * 10) / 10;
      if (w >= floor && h >= floor) continue;
      out.push({ where: describe(el), w, h });
    }
    // De-duplicate repeated rows (a list of 20 identical 20px buttons is one
    // finding, not twenty) while keeping the count visible.
    const grouped = new Map();
    for (const o of out) {
      const key = `${o.where}|${o.w}x${o.h}`;
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }
    return [...grouped.entries()].map(([key, n]) => ({ key, n }));
  }, min);
}

async function expectTapTargets(page, label) {
  const offenders = await tapTargetOffenders(page, TAP_MIN);
  const report = offenders.map((o) => `  · ${o.key}${o.n > 1 ? `  ×${o.n}` : ""}`).join("\n");
  // Logged unconditionally so a passing run still records the surface it
  // swept, and a failing one prints the whole actionable list.
  console.log(`\n[mobile] ${label}: ${offenders.length} tap-target offender type(s)\n${report || "  (none)"}`);
  expect(
    offenders,
    `${label} — controls below ${TAP_MIN}x${TAP_MIN} CSS px on a coarse pointer:\n${report}`,
  ).toEqual([]);
}

/* ── (d) icon-only controls that name themselves on touch ───────────────── */
// `scope` limits the check to per-item action toolbars: five or six identical
// ghost icons in a row, where the tooltip is the ONLY thing distinguishing
// them on a desktop and nothing does on a phone. Chrome affordances outside
// those toolbars (the top bar's gear) are covered by the accessible-name
// check instead.
async function untitledTipControls(page, scope) {
  return page.evaluate((sel) => {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const shown =
        typeof el.checkVisibility === "function" ? el.checkVisibility({ checkOpacity: true }) : true;
      if (!shown) continue;
      const tip = el.getAttribute("data-tip") || "";
      const text = (el.innerText || "").trim();
      const after = getComputedStyle(el, "::after").content;
      const captioned = after && after !== "none" && after !== "normal";
      if (!text && !captioned) out.push(`${tip || el.getAttribute("aria-label") || "(unnamed)"}`);
    }
    return out;
  }, scope);
}

async function namelessControls(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll(".hs-tip[data-tip]")) {
      const shown =
        typeof el.checkVisibility === "function" ? el.checkVisibility({ checkOpacity: true }) : true;
      if (!shown) continue;
      const name = el.getAttribute("aria-label") || (el.innerText || "").trim();
      if (!name) out.push(el.getAttribute("data-tip") || "(unnamed)");
    }
    return out;
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   (a) + (b) — the six surfaces, as the signed-in user
   ══════════════════════════════════════════════════════════════════════════ */
test.describe("mobile — layout and tap targets", () => {
  test.use({ storageState: USER_AUTH_FILE });

  const STUDIO_PAGES = [
    { path: "/studio", label: "/studio (agent)" },
    { path: "/studio/image", label: "/studio/image" },
    { path: "/studio/director", label: "/studio/director" },
    { path: "/studio/workflows", label: "/studio/workflows" },
  ];

  for (const { path, label } of STUDIO_PAGES) {
    test(`${label} fits the viewport and every control is tappable`, async ({ page }) => {
      await stubProviders(page);
      await page.goto(path);
      await settleApp(page);
      // The credit badge showing digits means the first GET /api/credits
      // landed on the surviving copy — the page is done moving.
      await expect(visible(page.locator(".st-credits"))).toContainText(/\d|—/, { timeout: 15000 });

      await expectNoHorizontalScroll(page, label);
      await expectTapTargets(page, label);
    });
  }

  test("/gallery fits the viewport and every control is tappable", async ({ page }) => {
    await page.goto("/gallery");
    await expect(page.getByRole("heading", { name: "Everything you have made." })).toBeVisible();
    await expectNoHorizontalScroll(page, "/gallery");
    await expectTapTargets(page, "/gallery");
  });
});

test.describe("mobile — admin", () => {
  test.use({ storageState: ADMIN_AUTH_FILE });

  test("/admin fits the viewport and every control is tappable", async ({ page }) => {
    await page.goto("/admin");
    // The section's own <h1>; each panel inside it repeats the name as an
    // <h2>, so this is deliberately scoped rather than a role lookup.
    await expect(page.locator("h1", { hasText: "Overview" })).toBeVisible({ timeout: 20000 });
    await expectNoHorizontalScroll(page, "/admin");
    await expectTapTargets(page, "/admin");
  });

  test("/admin?section=users keeps its table readable without a nested sideways scroller", async ({ page }) => {
    await page.goto("/admin?section=users");
    await expect(page.locator("h1", { hasText: "Users" })).toBeVisible({ timeout: 20000 });
    await expect(visible(page.locator(".hs-table")).first()).toBeVisible({ timeout: 20000 });

    await expectNoHorizontalScroll(page, "/admin?section=users");

    // .hs-table has `min-width: 560px`, so at 393px every admin table is
    // trapped behind its own horizontal scroller inside .hs-table-wrap.
    const trapped = await page.evaluate(() => {
      const out = [];
      for (const wrap of document.querySelectorAll(".hs-table-wrap")) {
        if (wrap.scrollWidth > wrap.clientWidth + 1) {
          out.push(`${wrap.scrollWidth}px of content in ${wrap.clientWidth}px`);
        }
      }
      return out;
    });
    expect(trapped, `admin tables still scroll sideways inside their wrapper: ${trapped.join("; ")}`).toEqual([]);
  });

  test("the admin section rail shows that it scrolls", async ({ page }) => {
    await page.goto("/admin");
    const rail = visible(page.locator(".pg-admin__side"));
    await expect(rail).toBeVisible({ timeout: 20000 });

    // 15 links in a ~1,900px strip with `scrollbar-width: none` — nothing on
    // screen says the other 12 exist. Either it no longer overflows, or it
    // carries a visible edge affordance.
    const state = await rail.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        overflows: el.scrollWidth > el.clientWidth + 1,
        // The scrolling-shadow technique paints its affordance with
        // background-image on the scroller itself.
        hasEdgeAffordance:
          (cs.backgroundImage && cs.backgroundImage !== "none") ||
          (cs.maskImage && cs.maskImage !== "none") ||
          (cs.webkitMaskImage && cs.webkitMaskImage !== "none"),
      };
    });
    expect(
      !state.overflows || state.hasEdgeAffordance,
      "the admin section rail scrolls horizontally with no visible sign that it does",
    ).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   (c) — the agent's side pane must be reachable
   ══════════════════════════════════════════════════════════════════════════ */
test.describe("mobile — the agent's session context is reachable", () => {
  test.use({ storageState: USER_AUTH_FILE });

  test("balance, Clear conversation, the latest plan and produced outputs all have a way back", async ({ page }) => {
    await stubProviders(page);
    await page.goto("/studio");
    await settleApp(page);
    await expect(visible(page.locator(".st-credits"))).toContainText(/\d|—/, { timeout: 15000 });

    // studio.css tries to drop the desktop pane below 1024px, but the plain
    // `.st-talk__side { display: flex }` rule further down the file has the
    // same specificity and wins — so today the aside is not hidden, it is
    // stacked underneath the conversation inside an `overflow: hidden` work
    // area, i.e. rendered, unscrollable and unreachable. Either state is a
    // dead end; the fix is to hide it for real AND give it a way back.
    await expect(page.locator("aside.st-talk__side")).toBeHidden();

    const trigger = visible(page.getByRole("button", { name: "Session", exact: true }));
    await expect(
      trigger,
      "no way to open the agent's session context on a phone — every other studio surface has one (.st-panel-tabs / .st-flow__open / the canvas layers sheet)",
    ).toBeVisible();

    await trigger.tap();
    const sheet = page.getByRole("dialog", { name: "Session" });
    await expect(sheet).toBeVisible();

    // The pane rendered in the sheet is the SAME subtree the desktop aside
    // renders, so anything that appears there — the latest-plan summary and
    // the produced-outputs list included — is reachable by construction.
    const pane = sheet.getByTestId("agent-session-pane");
    await expect(pane).toBeVisible();
    await expect(pane).toContainText("Balance");
    await expect(pane).toContainText("Spent here");
    await expect(pane).toContainText("How this works");

    await sheet.getByRole("button", { name: "Close" }).tap();
    await expect(sheet).toBeHidden();

    // "Clear conversation" only exists once there IS a conversation. Sending
    // one message is enough: chat needs an LLM key, which E2E deliberately
    // leaves empty (playwright.config.mjs), so the reply fails — but the
    // user's own turn stays in the feed, which is the state that reveals the
    // Clear control.
    const brief = visible(page.getByLabel("Creative brief"));
    await brief.fill("Reachability check");
    await visible(page.getByRole("button", { name: /^Send/ })).tap();
    await expect(visible(page.locator(".st-msg--user"))).toBeVisible({ timeout: 20000 });

    await trigger.tap();
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "Clear", exact: true }),
      "Clear conversation is stranded on a phone",
    ).toBeVisible();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   (d) — icon-only controls on a touch device
   ══════════════════════════════════════════════════════════════════════════ */
test("Director's per-shot buttons say what they do on touch", async ({ page }) => {
  test.slow();
  await stubProviders(page);

  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label: "mobdir" });
  });
  await loginThroughForm(page, user);

  await page.goto("/studio/director");
  await settleApp(page);
  await expect(visible(page.locator(".st-credits"))).toContainText(/\d/, { timeout: 15000 });

  const brief = visible(page.getByLabel("Production concept"));
  await brief.fill("A neon-lit night drive through an empty city, rain on the windshield.");
  await expect(brief).toHaveValue(/neon-lit night drive/);
  const build = visible(page.getByRole("button", { name: /Build shot plan/ }));
  await expect(build).toBeEnabled({ timeout: 15000 });
  await build.tap();
  await expect(visible(page.locator("article.st-shot"))).toHaveCount(8, { timeout: 45000 });

  // Every tipped control on the page has an accessible name — the floor.
  expect(await namelessControls(page), "icon-only controls with no accessible name").toEqual([]);

  // And inside the per-shot toolbars, where five identical ghost icons sit
  // side by side, the name is VISIBLE: `.hs-tip::after` is gated behind
  // `@media (hover: hover) and (pointer: fine)`, so on a phone there is
  // otherwise nothing at all to tell them apart.
  const untitled = await untitledTipControls(
    page,
    ".st-shot__tools .hs-tip[data-tip], .st-shot__foot .hs-tip[data-tip]",
  );
  expect(
    untitled,
    `per-shot action buttons with no visible label on touch: ${untitled.join(", ")}`,
  ).toEqual([]);

  // Named ones a real user reaches for, resolved through the role tree.
  for (const name of ["Edit shot 1", "Duplicate shot 1", "Move shot 1 later", "Delete shot 1"]) {
    await expect(visible(page.getByRole("button", { name }))).toBeVisible();
  }

  await expectNoHorizontalScroll(page, "/studio/director (planned)");
  await expectTapTargets(page, "/studio/director (planned)");
});
