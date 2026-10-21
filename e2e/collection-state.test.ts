import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await expect(page.locator('astro-island').filter({ has: page.locator('[data-entry-filter-bar]') })).not.toHaveAttribute('ssr');
}

test('tag and sort survive refresh and opening the shared URL', async ({ page }) => {
  await page.goto('/notes/');
  await ready(page);
  await page.locator('[data-tag="tools"]').first().click();
  await expect(page).toHaveURL(/tag=tools/);
  await page.locator('[data-sort-toggle]').click();
  await expect(page).toHaveURL(/sort=asc/);
  const visible = page.locator('[data-entry]:visible');
  const ids = await visible.evaluateAll(items => items.map(item => item.getAttribute('data-entry-id')));
  const url = page.url();
  await page.reload();
  await ready(page);
  await expect(page.locator('[data-sort-toggle]')).toHaveAttribute('aria-label', 'Sort: oldest first');
  await expect.poll(() => visible.evaluateAll(items => items.map(item => item.getAttribute('data-entry-id')))).toEqual(ids);
  await page.goto('/');
  await page.goto(url);
  await ready(page);
  await expect.poll(() => visible.evaluateAll(items => items.map(item => item.getAttribute('data-entry-id')))).toEqual(ids);
});

test('expanded list survives an article round trip', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.locator('[data-load-more]').click();
  await expect(page.locator('[data-entry]:visible')).toHaveCount(20);
  await expect(page).toHaveURL(/page=2/);
  await page.locator('[data-entry]:visible .entry-title a').first().click();
  await page.goBack();
  await ready(page);
  await expect(page.locator('[data-entry]:visible')).toHaveCount(20);
});

test('empty state clears filters while preserving unrelated URL state', async ({ page }) => {
  await page.goto('/notes/?tag=nonexistent-topic&sort=asc&campaign=test');
  await ready(page);
  await expect(page.locator('[data-empty]')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('[data-empty]')).toBeHidden();
  await expect(page).not.toHaveURL(/tag=/);
  await expect(page).toHaveURL(/campaign=test/);
  await expect(page.locator('[data-sort-toggle]')).toHaveAttribute('aria-label', 'Sort: oldest first');
});
