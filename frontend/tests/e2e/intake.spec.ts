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

  test("Stage all sequentially promotes every draft", async ({
    page,
    request,
  }) => {
    // Pre-seed two valid drafts via the API so we can focus on the bulk
    // action UI without re-treading the paste/queue path.
    await request.post("/api/drafts/primitives", {
      data: {
        slug: "bulk-stage-a",
        kind: "tool",
        name: "Bulk A",
        emitter: "opg://1111aaaa-1111-aaaa-1111-aaaa1111aaaa",
        license: "CC-BY-4.0",
        names: { en: { canonical: "bulk a", aliases: [] } },
        rel: [],
        domain: { category: "test" },
      },
    });
    await request.post("/api/drafts/primitives", {
      data: {
        slug: "bulk-stage-b",
        kind: "tool",
        name: "Bulk B",
        emitter: "opg://2222bbbb-2222-bbbb-2222-bbbb2222bbbb",
        license: "CC-BY-4.0",
        names: { en: { canonical: "bulk b", aliases: [] } },
        rel: [],
        domain: { category: "test" },
      },
    });

    await landOn(page);
    await page.locator("nav").getByText("Intake", { exact: true }).click();
    await expect(page.getByText("Bulk A")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Bulk B")).toBeVisible();

    // Click "Stage all (2)" in the Drafts queue card header.
    const stageAllBtn = page.getByRole("button", { name: /Stage all \(2\)/ });
    await stageAllBtn.click();

    // Wait until both /stage requests come back 201, then confirm the draft
    // queue empties.
    await page.waitForFunction(
      async () => {
        const res = await fetch("/api/drafts/primitives");
        const list = (await res.json()) as Array<unknown>;
        return list.length === 0;
      },
      undefined,
      { timeout: 15_000 },
    );
    await expect(page.getByText("No drafts yet")).toBeVisible();

    // Confirm both primitives now exist in the corpus and clean up.
    for (const slug of ["bulk-stage-a", "bulk-stage-b"]) {
      const res = await request.get(`/api/primitives/${slug}`);
      expect(res.ok()).toBe(true);
      await request.delete(`/api/primitives/${slug}`);
    }
  });

  test("dropping a .json file populates the textarea", async ({ page }) => {
    await landOn(page);
    await page.locator("nav").getByText("Intake", { exact: true }).click();

    const fileContent = `{
      "slug": "dropped-primitive",
      "kind": "tool",
      "name": "Dropped",
      "emitter": "opg://3333cccc-3333-cccc-3333-cccc3333cccc",
      "license": "CC-BY-4.0",
      "names": { "en": { "canonical": "dropped", "aliases": [] } },
      "rel": [],
      "domain": {}
    }`;

    // Simulate a drop on the textarea wrapper by dispatching a real
    // DragEvent with a DataTransfer carrying the file. Playwright's
    // dispatchEvent helper accepts a serializable description.
    const textarea = page.getByPlaceholder(/Paste here/);
    const wrapper = textarea.locator(".."); // the onDrop handler is on the wrapper div

    const dataTransfer = await page.evaluateHandle((content) => {
      const dt = new DataTransfer();
      const file = new File([content], "primitive.json", { type: "application/json" });
      dt.items.add(file);
      return dt;
    }, fileContent);

    await wrapper.dispatchEvent("drop", { dataTransfer });

    // Textarea should now contain the file content.
    await expect(textarea).toHaveValue(/dropped-primitive/);
    // And Parse should work on it like any other paste.
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/intake/parse") && r.status() === 200,
      ),
      page.getByRole("button", { name: /^Parse$/ }).click(),
    ]);
    await expect(page.getByText(/Preview · 1 ok · 0 error/)).toBeVisible();
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
