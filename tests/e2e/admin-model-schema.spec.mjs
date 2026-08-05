// Helmies Studio — E2E admin inputSchema editing (EDITSv1 M3)
//
// An admin opens the model catalog, edits a model's input schema as JSON
// (with the client-side field preview reacting), saves, and the change
// PERSISTS across a full page reload — proving the whole chain:
// ModelManager modal → POST /api/admin/models (server-side validation,
// src/lib/input-schema-validation.mjs) → ModelPricing.inputSchema → GET.
//
// Desktop chromium is enough for this spec (the JSON textarea + preview
// table is a desktop admin affordance); firefox/webkit add nothing here and
// the mobile project never matches this file (it only runs mobile.spec.mjs).
import { test, expect } from "@playwright/test";
import { ADMIN_AUTH_FILE } from "./fixtures/storage-state.mjs";

test.skip(({ browserName }) => browserName !== "chromium", "desktop chromium is enough for the admin schema editor");

test.describe("admin model schema editor", () => {
  test.use({ storageState: ADMIN_AUTH_FILE });

  test("an admin edits a schema field enum and the change persists across a reload", async ({ page }) => {
    // A value unique to this run, so a stale row from an earlier run can
    // never satisfy the final assertion.
    const marker = `e2e-enum-${Date.now()}`;
    const schema = {
      fields: {
        prompt: { type: "string", required: true },
        quality: { type: "string", required: false, enum: ["720p", "1080p", marker], default: "720p" },
      },
    };

    const openSchemaFor = async (name) => {
      await page.goto("/admin?section=models");
      await expect(page.getByRole("heading", { name: "Model catalog" })).toBeVisible();
      await page.getByLabel("Find a model").fill("nano-banana-2-lite");
      await page.getByRole("button", { name: `Edit schema for ${name}` }).click();
      await expect(page.getByRole("dialog", { name: `Schema for ${name}` })).toBeVisible();
    };

    await openSchemaFor("Nano Banana 2 Lite");

    const textarea = page.locator("#m-schema");
    await textarea.fill(JSON.stringify(schema, null, 2));

    // The client-side preview reflects the parsed fields before saving.
    const dialog = page.getByRole("dialog", { name: "Schema for Nano Banana 2 Lite" });
    await expect(dialog.getByRole("cell", { name: "quality" })).toBeVisible();
    await expect(dialog.getByRole("cell", { name: new RegExp(marker) })).toBeVisible();

    // Broken JSON disables saving; restoring valid JSON re-enables it.
    const save = dialog.getByRole("button", { name: "Save schema" });
    await textarea.fill("{ not json");
    await expect(dialog.getByText(/Not valid JSON/)).toBeVisible();
    await expect(save).toBeDisabled();
    await textarea.fill(JSON.stringify(schema, null, 2));
    await expect(save).toBeEnabled();

    await save.click();
    await expect(dialog).toBeHidden();

    // Full reload — the edited enum must come back from the database.
    await openSchemaFor("Nano Banana 2 Lite");
    await expect(page.locator("#m-schema")).toHaveValue(new RegExp(marker));
    await expect(page.getByRole("dialog", { name: "Schema for Nano Banana 2 Lite" }).getByRole("cell", { name: new RegExp(marker) })).toBeVisible();
  });
});
