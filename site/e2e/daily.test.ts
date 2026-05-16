import { test, expect, type Page } from '@playwright/test';

/**
 * Loads /daily/ and waits for the Astro redirect to settle on a real week URL.
 * `Astro.redirect()` is implemented in dev with a meta-refresh page, so
 * `page.goto('/daily/')` returns before the browser navigates — we have to
 * wait for the URL to match the week-page shape.
 */
async function gotoLatestWeek(page: Page): Promise<void> {
  await page.goto('/daily/');
  await expect(page).toHaveURL(/\/daily\/\d{4}-\d{2}-\d{2}\/$/);
}

test.describe('daily notes', () => {
  test('the /daily/ index redirects to the most-recent week', async ({ page }) => {
    await gotoLatestWeek(page);
  });

  test('renders one day section per daily note in the week', async ({ page }) => {
    await gotoLatestWeek(page);
    const days = page.locator('[data-day]');
    expect(await days.count()).toBeGreaterThan(0);
  });

  test('marks the current week chip as active in the strip', async ({ page }) => {
    await gotoLatestWeek(page);
    const active = page.locator('[data-strip-chips] [data-current="true"]');
    await expect(active).toHaveCount(1);
  });

  test('archive popover opens, closes on Escape, lists weeks with notes', async ({ page }) => {
    await gotoLatestWeek(page);

    const popover = page.locator('[data-archive-popover]');
    await expect(popover).toBeHidden();

    await page.click('[data-archive-toggle]');
    await expect(popover).toBeVisible();
    // Only the currently-visible month panel has rendered week-rows on-screen.
    await expect(popover.locator('.month:not([hidden]) .row-dot-on').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
  });

  test('archive nav steps through months and disables at the bounds', async ({ page }) => {
    await gotoLatestWeek(page);
    await page.click('[data-archive-toggle]');

    const popover = page.locator('[data-archive-popover]');
    const visibleLabel = popover.locator('.month-label:not([hidden])');
    const initialLabel = await visibleLabel.textContent();
    expect(initialLabel).toBeTruthy();

    // The "next" button should be disabled at the latest month after opening
    // on the most-recent week.
    await expect(popover.locator('[data-archive-next]')).toBeDisabled();

    await popover.locator('[data-archive-prev]').click();
    const afterPrev = await visibleLabel.textContent();
    expect(afterPrev).not.toBe(initialLabel);
  });

  test('prev-week button navigates to an earlier week', async ({ page }) => {
    await gotoLatestWeek(page);
    const startUrl = page.url();
    await page.click('[aria-label="Previous week"]');
    await expect(page).not.toHaveURL(startUrl);
    await expect(page.locator('[data-strip-chips] [data-current="true"]')).toHaveCount(1);
  });
});
