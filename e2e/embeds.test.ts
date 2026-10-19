import { test, expect } from '@playwright/test';

/**
 * `![[solar-system.html]]` HTML embeds (src/lib/html-embeds.mjs) against the
 * production build: the example note, guide chapter, and intro deck all embed
 * the vault's attachments/solar-system.html, which the build must copy next to
 * them, and the frame must follow the page's light/dark mode.
 */

test('a note frames the embed, which follows the theme toggle', async ({ page }) => {
  await page.goto('/notes/interactive-embeds/');
  const frame = page.locator('figure.html-embed iframe[src="/embeds/attachments/solar-system.html"]');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-popups');

  const embed = page.frameLocator('iframe[src="/embeds/attachments/solar-system.html"]');
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
  const figure = page.locator('figure.html-embed', { has: page.locator('iframe[src="/embeds/attachments/solar-system.html#view=sizes"]') });
  await expect(figure.locator('figcaption')).toHaveText('The planets, true to scale');
  const embed = page.frameLocator('iframe[src="/embeds/attachments/solar-system.html#view=sizes"]');
  await expect(embed.getByRole('button', { name: 'Sizes' })).toHaveAttribute('aria-pressed', 'true');
});

test('a slide frames the same embed from the deck', async ({ page }) => {
  // Slidev keeps neighbouring slides mounted, so select the embed by its file.
  await page.goto('/slides/intro/#/9');
  await expect(page.frameLocator('iframe.teaman-html-embed[src="embeds/solar-system.html"]')
    .getByRole('heading', { name: 'Our Solar System' })).toBeVisible();
});

test('the self-playing BGP walkthrough embeds in the note, guide, and deck', async ({ page }) => {
  await page.goto('/notes/interactive-embeds/');
  const noteFrame = page.locator('iframe[src="/embeds/attachments/bgp.html"]');
  await expect(noteFrame).toHaveAttribute('height', '680');
  await noteFrame.scrollIntoViewIfNeeded();
  const note = page.frameLocator('iframe[src="/embeds/attachments/bgp.html"]');
  await expect(note.getByRole('heading', { level: 1 })).toContainText('How BGP routes the internet');
  // It advances on its own: no controls, just the caption changing.
  await expect(note.locator('#kicker')).toHaveText(/Step 1 of 7/);
  await expect(note.locator('#kicker')).toHaveText(/Step 2 of 7/, { timeout: 12_000 });
  // The buttons jump between steps; a chosen step holds instead of looping on.
  await note.getByRole('button', { name: 'Next step' }).click();
  await expect(note.locator('#kicker')).toHaveText(/Step 3 of 7/);
  await expect(note.getByRole('button', { name: 'Play' })).toBeVisible();
  await note.getByRole('button', { name: /^Step 6:/ }).click();
  await expect(note.locator('#title')).toHaveText('A link fails: withdraw and reroute');
  await note.getByRole('button', { name: 'Previous step' }).click();
  await expect(note.locator('#kicker')).toHaveText(/Step 5 of 7/);

  await page.goto('/guides/using-this-system/embedding-html/');
  await page.locator('iframe[src="/embeds/attachments/bgp.html#step=2"]').scrollIntoViewIfNeeded();
  const guide = page.frameLocator('iframe[src="/embeds/attachments/bgp.html#step=2"]');
  await expect(guide.locator('#kicker')).toHaveText(/Step 2 of 7/);

  await page.goto('/slides/intro/#/10');
  await expect(page.frameLocator('iframe.teaman-html-embed[src="embeds/bgp.html"]').locator('#title')).not.toBeEmpty();
});
