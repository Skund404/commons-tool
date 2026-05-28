import { test, expect, type Page } from "@playwright/test";

// Drives the production single-binary build. Every test goes through:
//   1. Pre-dismiss the onboarding wizard (sets the same localStorage flag
//      the wizard sets on close).
//   2. Land on the page and wait for the dashboard to render.
//
// The UI uses inline styles (no classnames), so selectors lean on visible
// text. Sidebar nav buttons live inside <nav> and may carry a count badge
// (e.g. "Review 3"), which is why we match by text scoped to <nav> rather
// than by accessible-name.

async function landOn(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cm.onboarded", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto("/");
  // Sidebar always renders Dashboard label first; that's our "shell up" signal.
  await expect(page.locator("nav").getByText("Dashboard")).toBeVisible({ timeout: 10_000 });
}

async function gotoPane(page: Page, label: string) {
  // Sidebar buttons live inside <nav>. Use text matching scoped to nav so we
  // don't conflict with similarly named buttons elsewhere (e.g., the
  // dashboard's "Open review" card action). Buttons may carry a count badge
  // span, which is why exact-on-accessible-name does not work.
  await page.locator("nav").getByText(label, { exact: true }).click();
}

test.describe("dashboard", () => {
  test("dashboard greeting reflects live counts", async ({ page }) => {
    await landOn(page);
    // Wait for the PR list endpoint to populate.
    await page.waitForResponse(
      (r) => r.url().includes("/api/prs") && r.status() === 200,
      { timeout: 10_000 },
    );
    // The greeting uses <b> tags around live counts; we scope to that.
    await expect(page.locator("b").filter({ hasText: /\d+ primitives/ })).toBeVisible();
    await expect(page.locator("b").filter({ hasText: /\d+ open pull requests/ })).toBeVisible();
  });

  test("/api/health responds 200 with version", async ({ page }) => {
    const res = await page.request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe("string");
  });

  test("/api/primitives returns UI-shape with names map", async ({ page }) => {
    const res = await page.request.get("/api/primitives");
    expect(res.status()).toBe(200);
    const list = await res.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(10);
    const sample = list[0];
    expect(sample).toHaveProperty("slug");
    expect(sample).toHaveProperty("kind");
    expect(sample).toHaveProperty("names");
    const langs = Object.keys(sample.names);
    expect(langs.length).toBeGreaterThan(0);
    expect(sample.names[langs[0]]).toHaveProperty("canonical");
    expect(sample.names[langs[0]]).toHaveProperty("aliases");
  });
});

test.describe("browser pane", () => {
  test("renders primitives from /api/primitives", async ({ page }) => {
    await landOn(page);
    await gotoPane(page, "Browse");
    // Toolbar count surfaces once /api/primitives resolves.
    await expect(page.getByText(/of \d+ primitives/)).toBeVisible({ timeout: 10_000 });
    // First page should contain canonical mock-corpus tools.
    await expect(page.getByText("Round Knife").first()).toBeVisible();
    // Mock corpus has 10 distinct primitives; toolbar count proves the list rendered.
    await expect(page.getByText(/10 of 10 primitives/)).toBeVisible();
  });

  test("search filters the visible list", async ({ page }) => {
    await landOn(page);
    await gotoPane(page, "Browse");
    await expect(page.getByText("Round Knife").first()).toBeVisible({ timeout: 10_000 });
    await page.getByPlaceholder("Search primitives…").fill("awl");
    // After search Round Knife should drop out of the visible grid.
    await expect(page.getByText("Round Knife")).toHaveCount(0);
    // At least one awl-family primitive remains.
    await expect(page.getByText(/awl/i).first()).toBeVisible();
  });
});

test.describe("review pane", () => {
  test("PR #12 surfaces live recommender output including alias WARN", async ({
    page,
  }) => {
    await landOn(page);
    await gotoPane(page, "Review");
    await expect(page.getByText("Add scratch awl").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Recommendations · \d+/)).toBeVisible();
    await expect(page.getByText(/"awl" alias collides/i)).toBeVisible();
    await expect(page.getByText("License = CC-BY-4.0").first()).toBeVisible();
    const approveBtn = page.getByRole("button", { name: /Approve & Merge/i });
    await expect(approveBtn).toBeEnabled();
  });

  test("PR #10 surfaces kind-mismatch REJECT and blocks Merge", async ({ page }) => {
    await landOn(page);
    await gotoPane(page, "Review");
    await page.getByText(/Add `pinking-shears`/).click();
    // The recommendation REJECT title is unique to the recommendations card —
    // the semantic-changes list also mentions "kind mismatch" as a description.
    await expect(
      page.getByText("Kind mismatch: should be `tool`, not `technique`"),
    ).toBeVisible();
    await expect(page.getByText(/Outside primary craft/)).toBeVisible();
    const approveBtn = page.getByRole("button", { name: /Approve & Merge/i });
    await expect(approveBtn).toBeDisabled();
  });

  test("Approve & Merge fires the dry-run merge mutation", async ({ page }) => {
    await landOn(page);
    await gotoPane(page, "Review");
    await expect(page.getByText("Add scratch awl").first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Approve & Merge/i }).click();
    const submit = page.getByRole("button", { name: /Merge to main/i });
    await expect(submit).toBeVisible();
    const [mergeReq] = await Promise.all([
      page.waitForRequest(
        (r) => r.url().includes("/api/prs/12/merge") && r.method() === "POST",
      ),
      submit.click(),
    ]);
    expect(mergeReq.postDataJSON().method).toBe("squash");
    await expect(page.getByText(/Merged/i).first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("editor primitive switcher", () => {
  test("toolbar primitive button opens picker; selecting switches the editor", async ({
    page,
  }) => {
    await landOn(page);
    await gotoPane(page, "Browse");
    await expect(page.getByText("Round Knife").first()).toBeVisible({ timeout: 10_000 });
    await page.getByText("Round Knife").first().click();
    // Editor toolbar has the "Browse" back-link — durable signal we landed.
    const backBtn = page.locator("button").filter({ hasText: /^Browse$/ }).first();
    await expect(backBtn).toBeVisible({ timeout: 5_000 });

    // Click the primitive-name button (toolbar). Its visible text starts with
    // the current name; using exact-match on text inside button is brittle,
    // so we use the dedicated `title` attribute we set.
    await page.locator('[title="Switch primitive (also: ⌘K)"]').click();
    await expect(page.getByText("Switch primitive")).toBeVisible();
    await page.getByPlaceholder("Search by name or slug…").fill("saddle");
    await page.getByRole("button", { name: /saddle.stitch/i }).first().click();
    // The editor should now reflect saddle-stitch — toolbar shows the new name.
    await expect(page.getByText(/Saddle Stitch/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("Cmd/Ctrl+K opens the global search modal from any pane", async ({ page }) => {
    // Cmd/Ctrl+K used to open the Editor's scoped switcher; it now opens the
    // app-level GlobalSearchModal (App.tsx) instead, which works from any
    // pane. Verify from the Editor since that was the original coverage.
    await landOn(page);
    await gotoPane(page, "Browse");
    await expect(page.getByText("Round Knife").first()).toBeVisible({ timeout: 10_000 });
    await page.getByText("Round Knife").first().click();
    await expect(
      page.locator("button").filter({ hasText: /^Browse$/ }).first(),
    ).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Control+K");
    // Global modal is titled "Search commons" (vs the editor's "Switch primitive").
    await expect(page.getByText("Search commons").first()).toBeVisible();
  });
});

test.describe("Edit jump from Review", () => {
  test("clicking Edit on a PR file row opens the primitive in Editor", async ({
    page,
  }) => {
    await landOn(page);
    await gotoPane(page, "Review");
    await page.getByText(/Add `pinking-shears`/).click();
    // The pinking-shears file row's Edit button (carries title text).
    const fileEdit = page
      .locator('button[title="Open this primitive in the editor"]')
      .first();
    await expect(fileEdit).toBeVisible({ timeout: 5_000 });
    await fileEdit.click();
    // Landing on Editor — "Browse" back-link is the durable marker.
    await expect(
      page.locator("button").filter({ hasText: /^Browse$/ }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
