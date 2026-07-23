import { expect, test } from '@playwright/test';

test.describe('architecture decisions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/decisions/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('renders the ReUI timeline and status badges', async ({ page }) => {
    await expect(page.locator('[data-slot="timeline"]')).toBeVisible();
    expect(await page.locator('[data-slot="timeline-item"]').count()).toBeGreaterThan(0);
    expect(await page.locator('[data-adr-status]').count()).toBeGreaterThan(0);
  });

  test('filters decisions by status and removes the filter', async ({ page }) => {
    const allCount = await page.locator('[data-adr-card]').count();
    const acceptedCount = await page.locator('[data-adr-status="accepted"]').count();

    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.getByRole('option', { name: 'Status' }).hover();
    await page.getByRole('option', { name: /^Accepted/ }).click();

    await expect(page.locator('[data-adr-card]')).toHaveCount(acceptedCount);
    await page.getByRole('button', { name: 'Remove Status filter' }).click();
    await expect(page.locator('[data-adr-card]')).toHaveCount(allCount);
  });

  test('searches and selects multiple terms from one filter field', async ({ page }) => {
    const acceptedCount = await page.locator('[data-adr-status="accepted"]').count();
    const proposedCount = await page.locator('[data-adr-status="proposed"]').count();

    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await expect(page.getByPlaceholder('Filter...')).toBeVisible();
    await page.getByRole('option', { name: 'Status' }).hover();

    const termSearch = page.getByPlaceholder('Search status...');
    await expect(termSearch).toBeVisible();
    await termSearch.fill('accept');
    await page.getByRole('option', { name: /^Accepted/ }).click();
    await termSearch.fill('propos');
    await page.getByRole('option', { name: /^Proposed/ }).click();

    await expect(page.locator('[data-adr-card]')).toHaveCount(
      acceptedCount + proposedCount,
    );
    await expect(page.getByRole('button', { name: 'Filter', exact: true })).toBeVisible();
  });

  test('reopens an active filter with its terms selected and can deselect them', async ({ page }) => {
    const allCount = await page.locator('[data-adr-card]').count();

    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.getByRole('option', { name: 'Status' }).hover();
    await page.getByRole('option', { name: /^Accepted/ }).click();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.getByRole('option', { name: 'Status' }).hover();
    const accepted = page.getByRole('option', { name: /^Accepted/ });
    await expect(accepted).toHaveAttribute('aria-checked', 'true');
    await accepted.click();

    await expect(page.locator('[data-adr-card]')).toHaveCount(allCount);
    await expect(page.getByRole('button', { name: 'Remove Status filter' })).toHaveCount(0);
  });

  test('keeps active filters reachable on a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.getByRole('option', { name: 'Status' }).hover();
    await page.getByRole('option', { name: /^Superseded/ }).click();

    const filterStrip = page.locator('[data-filter-scroll]');
    const viewport = filterStrip.locator('[data-slot="scroll-area-viewport"]');
    const removeButton = page.getByRole('button', { name: 'Remove Status filter' });
    await expect(
      filterStrip.locator('[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]'),
    ).toBeAttached();

    const sizes = await viewport.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(sizes.scrollWidth).toBeGreaterThan(sizes.clientWidth);

    await removeButton.evaluate((element) => {
      element.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
    const isReachable = await viewport.evaluate((scrollViewport) => {
      const button = scrollViewport.querySelector<HTMLElement>(
        'button[aria-label="Remove Status filter"]',
      );
      if (!button) return false;
      const buttonRect = button.getBoundingClientRect();
      const stripRect = scrollViewport.getBoundingClientRect();
      return buttonRect.left >= stripRect.left && buttonRect.right <= stripRect.right;
    });
    expect(isReachable).toBe(true);
  });

  test('keeps the grouped layout and ADR detail dialog working', async ({ page }) => {
    await page.getByRole('button', { name: 'Grouped' }).click();
    await expect(page.locator('[data-slot="timeline"]')).toHaveCount(0);

    await page.locator('[data-adr-card]').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-adr-status]')).toBeVisible();
    const scrollArea = dialog.locator('[data-slot="scroll-area"]');
    await expect(scrollArea).toBeVisible();
    await expect(scrollArea.getByRole('heading').first()).toBeVisible();
    await expect(dialog.locator('[data-slot="scroll-area-scrollbar"]')).toBeAttached();
  });
});
