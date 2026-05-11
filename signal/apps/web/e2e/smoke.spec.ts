import { test, expect } from "@playwright/test";

const THESIS_SLUG = "war-peace-gold-short";

test.beforeEach(async ({ page, context }) => {
  await context.addInitScript(() => {
    (window as Window & { __DEPTH4_E2E__?: { thesisTickMs?: number } }).__DEPTH4_E2E__ = { thesisTickMs: 400 };
  });
  await page.goto("/theses");
  await page.evaluate(() => {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith("depth4.")) sessionStorage.removeItem(k);
    }
  });
  await page.goto(`/theses?openDrawer=${THESIS_SLUG}`);
  await expect(page.getByRole("heading", { name: "Live theses" })).toBeVisible();
});

test("depth4 theses → drawer → book critical path", async ({ page }) => {
  test.setTimeout(120_000);
  await expect(page.getByTestId("thesis-drawer-open-position")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId(`thesis-star-${THESIS_SLUG}`).last().click();
  await page.getByRole("button", { name: "Close drawer" }).first().click();
  await expect(page.getByRole("dialog", { name: "Thesis detail" })).toBeHidden({ timeout: 15_000 });

  await page.goto(`/theses/${THESIS_SLUG}`);
  await expect(page.getByTestId("scenario-view-section")).toBeVisible();
  await expect(page.getByTestId("scenario-calibrating-line")).toHaveText(/Calibrating from live macro, news, and flow/);
  await expect(page.getByTestId("scenario-why-probabilities")).toHaveCount(0);
  await page.getByTestId("thesis-drawer-open-position").click();
  await expect(page.getByRole("dialog", { name: "Open position" })).toBeVisible();
  const openPosDialog = page.getByRole("dialog", { name: "Open position" });
  await openPosDialog.getByTestId("open-position-entry").fill("3290");
  await openPosDialog.getByTestId("open-position-size").fill("0.25");
  await openPosDialog.getByTestId("open-position-save").evaluate((el) => (el as HTMLButtonElement).click());
  await expect(openPosDialog).toBeHidden();

  await page.getByTestId("thesis-mark-resolved").scrollIntoViewIfNeeded();
  await page.getByTestId("thesis-mark-resolved").click();

  await page.getByTestId("thesis-alerts-bell").click();
  await expect(page.getByTestId("thesis-alert-row")).toBeVisible();
  await page.getByTestId("thesis-alert-dismiss").click();
  await expect(page.getByTestId("thesis-alert-row")).toBeHidden();

  await page.goto("/book");
  await expect(page.getByTestId("book-session-open-count")).toHaveText("1");

  await page.locator('[data-testid^="book-close-position-"]').click();
  const closeDialog = page.getByRole("dialog", { name: /Close position/i });
  await expect(closeDialog).toBeVisible();
  await closeDialog.getByTestId("close-position-exit").fill("3285");
  await closeDialog.getByTestId("close-position-realized").fill("12.5");
  await closeDialog.getByTestId("close-position-save").evaluate((el) => (el as HTMLButtonElement).click());

  await expect(page.getByTestId("book-session-open-count")).toHaveText("0");
  await expect(page.getByTestId("book-session-closed-count")).toHaveText("1");
});
