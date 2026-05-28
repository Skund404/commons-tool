import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Intake pane coverage:
//   1. Paste mixed-shape JSON (one spec-shape, one UI-shape) → Parse →
//      verify both detected
//   2. Queue the parsed items → verify drafts appear in the queue table
//   3. Discard one → verify it disappears
//
// Cleanup: drain all drafts after each test so subsequent runs are clean.

async function cleanup(request: APIRequestContext) {
  const list = await request.get("/api/drafts/primitives");
  if (list.ok()) {
    for (const d of (await list.json()) as Array<{ id: string }>) {
      await request.delete(`/api/drafts/primitives/${d.id}`).catch(() => {});
    }
  }
}
test.beforeEach(async ({ request }) => cleanup(request));
test.afterEach(async ({ request }) => cleanup(request));

async function landOn(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cm.onboarded", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto("/");
  await expect(page.locator("nav").getByText("Dashboard")).toBeVisible({ timeout: 10_000 });
}

const SPEC_DOC = `{
  "opgl_version": "0.6",
  "emitter": "opg://aaaa1111-aaaa-1111-aaaa-1111aaaa1111",
  "id": "french-skiver-001",
  "slug": "french-skiver",
  "kind": "tool",
  "name": "French Skiver",
  "created": "2026-05-28",
  "content_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000999",
  "properties": {
    "license": "CC-BY-4.0",
    "names": { "en": ["french skiver"] }
  },
  "lineage": { "provenance_state": "unasserted", "outcome": "unknown" }
}`;

const UI_DOC = `{
  "slug": "bone-folder-import",
  "kind": "tool",
  "name": "Bone Folder",
  "emitter": "opg://bbbb2222-bbbb-2222-bbbb-2222bbbb2222",
  "license": "CC-BY-4.0",
  "names": { "en": { "canonical": "bone folder", "aliases": [] } },
  "rel": [],
  "domain": { "category": "finishing" }
}`;

test.describe("intake pane", () => {
  test("paste mixed-shape JSON → Parse → preview surfaces both candidates", async ({
    page,
  }) => {
    await landOn(page);
    await page.locator("nav").getByText("Intake", { exact: true }).click();
    // Toolbar marker for this pane.
    await expect(page.getByText("paste shared primitives")).toBeVisible();

    const payload = `[${SPEC_DOC},${UI_DOC}]`;
    await page.getByPlaceholder(/Paste here/).fill(payload);
    // Set up the response listener BEFORE the click that fires the request,
    // otherwise the response may land first and the wait would time out.
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/intake/parse") && r.status() === 200,
        { timeout: 10_000 },
      ),
      page.getByRole("button", { name: /^Parse$/ }).click(),
    ]);

    // Preview card surfaces 2 ok / 0 errors.
    await expect(page.getByText(/Preview · 2 ok · 0 error/)).toBeVisible();
    // Both slugs visible in the preview rows. Use the mono row text format
    // ("<slug> · <Kind> · <source>") to scope past the textarea echo of the
    // raw paste.
    await expect(page.getByText(/^french-skiver · Tool · spec$/)).toBeVisible();
    await expect(page.getByText(/^bone-folder-import · Tool · ui$/)).toBeVisible();
  });

  test("Queue selected → drafts table fills, draft id appears", async ({
    page,
    request,
  }) => {
    await landOn(page);
    await page.locator("nav").getByText("Intake", { exact: true }).click();

    await page.getByPlaceholder(/Paste here/).fill(UI_DOC);
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/intake/parse") && r.status() === 200,
        { timeout: 10_000 },
      ),
      page.getByRole("button", { name: /^Parse$/ }).click(),
    ]);

    // The Queue button label includes the count.
    const queueBtn = page.getByRole("button", { name: /Queue selected/i });
    await expect(queueBtn).toBeEnabled();
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/intake/queue") && r.status() === 200,
      ),
      queueBtn.click(),
    ]);

    // Drafts queue card shows the new entry — by name.
    await expect(page.getByText("Bone Folder").first()).toBeVisible({ timeout: 5_000 });
    // The Stage / Validate / Edit / discard row controls render on the draft row.
    const stageBtn = page.getByRole("button", { name: /^Stage$/ }).first();
    await expect(stageBtn).toBeVisible();

    // Verify via API that a draft now exists with the expected slug.
    const list = await request.get("/api/drafts/primitives");
    const drafts = (await list.json()) as Array<{ slug?: string; title?: string }>;
    expect(drafts.some((d) => d.slug === "bone-folder-import")).toBe(true);
  });

  test("Discard removes the draft", async ({ page, request }) => {
    // Pre-seed a draft via API so the test focuses on UI behavior.
    await request.post("/api/drafts/primitives", {
      data: { slug: "to-discard", kind: "tool", name: "To discard" },
    });

    await landOn(page);
    await page.locator("nav").getByText("Intake", { exact: true }).click();

    await expect(page.getByText("To discard")).toBeVisible({ timeout: 10_000 });

    // Click the trash icon button on the draft row. The danger button on the
    // draft row has no text label (icon-only) — Playwright assigns it an
    // empty accessible name. Buttons next to it (Edit / Validate / Stage)
    // all have labels, so the empty-name button is the trash.
    const draftRow = page.getByText("To discard").locator("..").locator("..");
    const trashBtn = draftRow.getByRole("button", { name: "" }).last();
    await trashBtn.click();

    // Confirm modal renders with title 'Delete primitive "To discard"' and
    // a danger button labeled 'Delete primitive'.
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/drafts/primitives/") &&
          r.request().method() === "DELETE" &&
          r.status() === 200,
        { timeout: 10_000 },
      ),
      page.getByRole("button", { name: /Delete primitive/ }).click(),
    ]);

    // The draft row is gone.
    await expect(page.getByText("To discard")).toHaveCount(0);
  });
});
