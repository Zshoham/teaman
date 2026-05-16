import { test, expect } from '@playwright/test';

test.describe('home page', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage so theme state never bleeds between tests.
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  // ── Layout & content ──────────────────────────────────────────────────────

  test('shows the brand name and tagline', async ({ page }) => {
    await expect(page.locator('.brand-name')).toContainText('vault.teaman');
    await expect(page.locator('.brand-tagline')).toContainText('a working garden');
  });

  test('renders all three entries on initial load', async ({ page }) => {
    await expect(page.locator('[data-entry]')).toHaveCount(3);
  });

  test('shows a note, a guide, and a slides entry', async ({ page }) => {
    await expect(page.locator('[data-entry][data-type="note"]')).toHaveCount(1);
    await expect(page.locator('[data-entry][data-type="guide"]')).toHaveCount(1);
    await expect(page.locator('[data-entry][data-type="slides"]')).toHaveCount(1);
  });

  test('displays hero stats that match the entry counts', async ({ page }) => {
    await expect(page.locator('.stat-row').filter({ hasText: 'notes' })).toContainText('001');
    await expect(page.locator('.stat-row').filter({ hasText: 'guides' })).toContainText('001');
    await expect(page.locator('.stat-row').filter({ hasText: 'slides' })).toContainText('001');
  });

  // ── Filter ────────────────────────────────────────────────────────────────

  test('filter: notes pill hides guide and slides entries', async ({ page }) => {
    await page.click('[data-filter="note"]');

    await expect(page.locator('[data-entry][data-type="note"]')).toBeVisible();
    await expect(page.locator('[data-entry][data-type="guide"]')).toBeHidden();
    await expect(page.locator('[data-entry][data-type="slides"]')).toBeHidden();
  });

  test('filter: guides pill hides note and slides entries', async ({ page }) => {
    await page.click('[data-filter="guide"]');

    await expect(page.locator('[data-entry][data-type="guide"]')).toBeVisible();
    await expect(page.locator('[data-entry][data-type="note"]')).toBeHidden();
    await expect(page.locator('[data-entry][data-type="slides"]')).toBeHidden();
  });

  test('filter: all pill restores all entries after a type filter', async ({ page }) => {
    await page.click('[data-filter="note"]');
    await page.click('[data-filter="all"]');

    for (const entry of await page.locator('[data-entry]').all()) {
      await expect(entry).toBeVisible();
    }
  });

  test('filter: active pill has aria-pressed="true"', async ({ page }) => {
    await page.click('[data-filter="slides"]');

    await expect(page.locator('[data-filter="slides"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-filter="all"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-filter="note"]')).toHaveAttribute('aria-pressed', 'false');
  });

  // ── Sort ──────────────────────────────────────────────────────────────────

  test('sort: arrow starts pointing down (newest first)', async ({ page }) => {
    await expect(page.locator('.sort-arrow')).toHaveText('↓');
  });

  test('sort: arrow points up after clicking the sort toggle', async ({ page }) => {
    await page.click('[data-sort-toggle]');
    await expect(page.locator('.sort-arrow')).toHaveText('↑');
  });

  test('sort: aria-label updates to reflect the current direction', async ({ page }) => {
    await page.click('[data-sort-toggle]');
    await expect(page.locator('[data-sort-toggle]')).toHaveAttribute(
      'aria-label', 'Sort: oldest first'
    );

    await page.click('[data-sort-toggle]');
    await expect(page.locator('[data-sort-toggle]')).toHaveAttribute(
      'aria-label', 'Sort: newest first'
    );
  });

  // ── Tag ───────────────────────────────────────────────────────────────────

  test('tag: clicking a tag in the sidebar filters to matching entries', async ({ page }) => {
    // The sidebar topic button for 'architecture' — only the note has this tag.
    await page.click('[data-tag="architecture"]');

    await expect(page.locator('[data-entry][data-type="note"]')).toBeVisible();
    await expect(page.locator('[data-entry][data-type="guide"]')).toBeHidden();
    await expect(page.locator('[data-entry][data-type="slides"]')).toBeHidden();
  });

  test('tag: active-tag chip appears with the selected tag name', async ({ page }) => {
    await page.click('[data-tag="architecture"]');

    await expect(page.locator('[data-active-tag]')).toBeVisible();
    await expect(page.locator('[data-active-tag-name]')).toHaveText('#architecture');
  });

  test('tag: clear button dismisses the filter and hides the chip', async ({ page }) => {
    await page.click('[data-tag="architecture"]');
    await page.click('[data-tag-clear]');

    await expect(page.locator('[data-active-tag]')).toBeHidden();
    for (const entry of await page.locator('[data-entry]').all()) {
      await expect(entry).toBeVisible();
    }
  });

  test('tag: clicking the same tag twice clears it (toggle behaviour)', async ({ page }) => {
    await page.click('[data-tag="architecture"]');
    await page.click('[data-tag="architecture"]');

    await expect(page.locator('[data-active-tag]')).toBeHidden();
    await expect(page.locator('[data-entry][data-type="guide"]')).toBeVisible();
  });

  test('tag: topic button gains is-active class when selected', async ({ page }) => {
    await page.click('[data-tag="architecture"]');
    await expect(page.locator('[data-tag="architecture"]').first()).toHaveClass(/is-active/);
  });

  // ── Filter + tag combination ──────────────────────────────────────────────

  test('filter + tag: both constraints apply simultaneously', async ({ page }) => {
    await page.click('[data-filter="note"]');         // only notes
    await page.click('[data-tag="architecture"]');    // + tag architecture

    // The note has 'architecture', so it stays visible.
    await expect(page.locator('[data-entry][data-type="note"]')).toBeVisible();
    // Guide is hidden by the type filter.
    await expect(page.locator('[data-entry][data-type="guide"]')).toBeHidden();
  });

  // ── Theme ─────────────────────────────────────────────────────────────────

  test('theme: toggle applies data-theme="dark" on first click', async ({ page }) => {
    await page.click('[data-theme-toggle]');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('theme: toggle flips to light mode on second click', async ({ page }) => {
    await page.click('[data-theme-toggle]');
    await page.click('[data-theme-toggle]');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('theme: preference is persisted in localStorage', async ({ page }) => {
    await page.click('[data-theme-toggle]');
    const stored = await page.evaluate(() => localStorage.getItem('vault-theme'));
    expect(stored).toBe('dark');
  });

  test('theme: persisted preference is restored on page reload', async ({ page }) => {
    await page.click('[data-theme-toggle]'); // → dark, stored in localStorage
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
