import { test, expect } from '@playwright/test';

/**
 * `![[solar-system.html]]` HTML embeds (src/lib/html-embeds.mjs) against the
 * production build: the example note, guide chapter, and intro deck all embed
 * the vault's attachments/solar-system.html, which the build must copy next to
 * them, and the frame must follow the page's light/dark mode.
 */

test('a note frames the embed, which follows the theme toggle', async ({ page }) => {
  await page.goto('/notes/interactive-embeds/');
  const frame = page.locator('figure.html-embed iframe');
  await expect(frame).toHaveAttribute('src', '/embeds/attachments/solar-system.html');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-popups');

  const embed = page.frameLocator('figure.html-embed iframe');
  await expect(embed.getByRole('heading', { name: 'Our Solar System' })).toBeVisible();
  const theme = () => embed.locator('html').getAttribute('data-theme');
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await expect.poll(theme).toBe(before);

  await page.click('[data-theme-toggle]');
  await expect.poll(theme).toBe(before === 'dark' ? 'light' : 'dark');

  // Interactive inside the frame: stop the orbits, then choose a planet.
  await embed.getByRole('button', { name: 'Pause' }).click();
  await embed.getByRole('button', { name: /^Mars/ }).click();
  await expect(embed.locator('#card-name')).toHaveText('Mars');
});

test('a guide chapter passes the fragment through to the embed', async ({ page }) => {
  await page.goto('/guides/using-this-system/embedding-html/');
  await expect(page.locator('figure.html-embed iframe'))
    .toHaveAttribute('src', '/embeds/attachments/solar-system.html#view=sizes');
  await expect(page.locator('figure.html-embed figcaption')).toHaveText('The planets, true to scale');
  const embed = page.frameLocator('figure.html-embed iframe');
  await expect(embed.getByRole('button', { name: 'Sizes' })).toHaveAttribute('aria-pressed', 'true');
});

test('a slide frames the same embed from the deck', async ({ page }) => {
  await page.goto('/slides/intro/#/9');
  const frame = page.locator('iframe.teaman-html-embed');
  await expect(frame).toHaveAttribute('src', 'embeds/solar-system.html');
  await expect(page.frameLocator('iframe.teaman-html-embed').getByRole('heading', { name: 'Our Solar System' }))
    .toBeVisible();
});
