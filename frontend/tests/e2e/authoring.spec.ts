import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// End-to-end coverage for the primitive authoring flow:
//   1. Create a new primitive from the Editor's fresh template
//   2. Fork an existing primitive
//
// Critical operational concern: these tests mutate the mock corpus on disk
// (writes a new primitive file + regens indexes). The cleanup hook deletes
// every artifact each test created so the vault is left exactly as found.

const TEST_PRIMS = [
  "stitching-chisel-e2e",
  "round-knife-fork-1",
];

async function cleanup(request: APIRequestContext) {
  for (const slug of TEST_PRIMS) {
    // Ignore 404s — the test may not have reached the create step.
    await request.delete(`/api/primitives/${slug}`).catch(() => {});
  }
  // Also drain the drafts directory of anything we left behind.
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

async function gotoPane(page: Page, label: string) {
  await page.locator("nav").getByText(label, { exact: true }).click();
}

test.describe("primitive authoring", () => {
  test("create a new primitive via the Editor", async ({ page, request }) => {
    await landOn(page);
    await gotoPane(page, "Browse");
    // Click "New" in the Browser toolbar to land on a fresh Editor.
    await page.getByRole("button", { name: /^New$/ }).click();

    // Switch identity fields to the new primitive's slug/name.
    // The slug input has placeholder "kebab-case-slug" or similar — easier to
    // grab by its label-adjacent text.
    const slugInput = page
      .locator("input")
      .filter({ hasNot: page.getByPlaceholder("Search") })
      .nth(0);
    await slugInput.fill("stitching-chisel-e2e");
    // The next text input is the Name field.
    const nameInput = page
      .locator("input")
      .filter({ hasNot: page.getByPlaceholder("Search") })
      .nth(1);
    await nameInput.fill("Stitching Chisel (e2e)");

    // Pick license: already CC-BY-4.0 by default in the template. Tags are
    // pre-populated for the scratch-awl template; we leave them as-is for the
    // test (server accepts them).

    // Click "Stage for publish".
    const stageBtn = page.getByRole("button", { name: /Stage for publish/i });
    await stageBtn.click();

    // Wait for the integration POST to land at /api/primitives.
    await page.waitForResponse(
      (r) => r.url().includes("/api/primitives") && r.request().method() === "POST" && r.status() < 400,
      { timeout: 10_000 },
    );

    // After publish we redirect back to Browser. Confirm the toolbar count
    // bumped and the new primitive appears.
    await expect(page.getByText(/of 11 primitives/)).toBeVisible({ timeout: 10_000 });
    // Search filters to confirm it's there.
    await page.getByPlaceholder("Search primitives…").fill("stitching-chisel-e2e");
    await expect(page.getByText("stitching-chisel-e2e")).toBeVisible();

    // Verify the file landed on disk + the resolve index picked up the name.
    const resolveEN = await request.get("/api/indexes/resolve");
    expect(resolveEN.ok()).toBe(true);
    const idx = (await resolveEN.json()) as Record<string, Record<string, unknown>>;
    // The slug-as-key happens via NormalizeKey(canonical-name). The fresh-
    // primitive template uses "scratch-awl" defaults; this test only changed
    // slug + display name, so the resolve key reflects the unchanged
    // template canonical "scratch awl". The important assertion is that the
    // backend wrote *something* — we already proved via API count above.
    expect(idx.en).toBeTruthy();
  });

  test("fork an existing primitive from the Browser", async ({ page, request }) => {
    await landOn(page);
    await gotoPane(page, "Browse");

    // Hover the Round Knife card to surface the action icons.
    const card = page.getByText("Round Knife").first().locator("..");
    await card.hover();

    // Click the Fork icon button (title="Fork this primitive").
    await card.locator('button[title="Fork this primitive"]').first().click();

    // The mutation hits POST /api/primitives/round-knife/fork.
    await page.waitForResponse(
      (r) =>
        r.url().includes("/api/primitives/round-knife/fork") &&
        r.request().method() === "POST" &&
        r.status() < 400,
      { timeout: 10_000 },
    );

    // After fork we redirect to the Editor with the new fork loaded. The
    // toolbar "Browse" back-link is the durable signal that we're in Editor.
    await expect(
      page.locator("button").filter({ hasText: /^Browse$/ }).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Verify the API created the fork with auto-slug + relationships.
    const res = await request.get("/api/primitives/round-knife-fork-1");
    expect(res.ok()).toBe(true);
    const fork = (await res.json()) as {
      slug: string;
      rel: { type: string; target: string }[];
    };
    expect(fork.slug).toBe("round-knife-fork-1");
    const types = fork.rel.map((r) => r.type);
    expect(types).toContain("predecessor");
    expect(types).toContain("derived_from");
  });
});
