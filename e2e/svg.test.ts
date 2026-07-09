import { test, expect } from '@playwright/test';

// The example vault embeds two markdown svg images (attachments/env-seam.svg in
// vault-architecture, notes/assets/teacup.svg in tools-for-thought). The engine
// inlines them at build time (src/lib/remark-inline-svg.mjs) so currentColor /
// var(--…) theme tokens resolve against the page and follow the theme toggle.
test.describe('inlined svg images', () => {
  test('a markdown svg image renders inline, not as <img>', async ({ page }) => {
    await page.goto('/notes/vault-architecture/');
    const svg = page.locator('.prose svg.content-svg').first();
    await expect(svg).toBeVisible();
    await expect(svg).toHaveAttribute('role', 'img');
    await expect(svg).toHaveAttribute('aria-label', /vault/i);
    expect(await page.locator('.prose img[src$=".svg"]').count()).toBe(0);
  });

  test('the alt text shows as a visible caption and a hover title', async ({ page }) => {
    await page.goto('/notes/vault-architecture/');
    const figure = page.locator('.prose figure.content-figure').first();
    await expect(figure.locator('figcaption')).toHaveText(/vault/i);
    // The svg <title> is what browsers surface as the hover tooltip.
    await expect(figure.locator('svg > title')).toHaveText(/vault/i);
  });

  test('a note-relative svg next to the notes resolves too', async ({ page }) => {
    await page.goto('/notes/tools-for-thought/');
    // The note also carries a hand-written decorative inline svg; select the
    // engine-inlined one by the class the remark plugin injects.
    await expect(page.locator('.prose svg.content-svg').first()).toBeVisible();
  });

  test('inlined svg colors follow the light/dark toggle', async ({ page }) => {
    await page.goto('/notes/vault-architecture/');
    const svg = page.locator('.prose svg.content-svg').first();
    await expect(svg).toBeVisible();

    // currentColor inherits the page foreground; theme tokens re-resolve when
    // data-theme flips, so both must change with the toggle.
    const colors = () =>
      svg.evaluate((el) => {
        const style = getComputedStyle(el);
        return [style.color, style.getPropertyValue('--primary').trim()];
      });

    const before = await colors();
    await page.click('[data-theme-toggle]');
    await expect.poll(colors).not.toEqual(before);
    const after = await colors();
    expect(after[0]).not.toBe(before[0]); // currentColor
    expect(after[1]).not.toBe(before[1]); // var(--primary)
  });
});
