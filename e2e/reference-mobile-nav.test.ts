import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('document navigation stays reachable and closes after a search result jump', async ({ page }) => {
  await page.goto('/references/teaman-system/');
  const nav = page.locator('[data-mobile-reference-nav]');
  await expect(page.locator('astro-island').filter({ has: nav })).not.toHaveAttribute('ssr');
  await page.evaluate(() => window.scrollTo({ top: 1100, behavior: 'instant' }));
  await expect.poll(async () => {
    const box = await nav.boundingBox();
    const header = await page.locator('#site-header').boundingBox();
    return Math.abs(box!.y - (header!.y + header!.height));
  }).toBeLessThan(2);
  await nav.locator('summary').click();
  await nav.getByRole('textbox', { name: 'Search sections in this document' }).fill('configuration');
  const result = nav.getByRole('list', { name: 'Matching sections' }).getByRole('link').first();
  const href = await result.getAttribute('href');
  await result.click();
  await expect(nav).not.toHaveAttribute('open');
  await expect.poll(() => new URL(page.url()).hash).toBe(href);
  const target = page.locator(href!);
  await expect(target).toBeFocused();
  await expect.poll(async () => (await target.boundingBox())!.y - ((await nav.boundingBox())!.y + (await nav.boundingBox())!.height)).toBeGreaterThanOrEqual(0);
});

test('Escape closes the panel and returns focus to its trigger', async ({ page }) => {
  await page.goto('/references/teaman-system/');
  const nav = page.locator('[data-mobile-reference-nav]');
  await expect(page.locator('astro-island').filter({ has: nav })).not.toHaveAttribute('ssr');
  await nav.locator('summary').click();
  await nav.getByRole('textbox').focus();
  await page.keyboard.press('Escape');
  await expect(nav).not.toHaveAttribute('open');
  await expect(nav.locator('summary')).toBeFocused();
});
