import { test, expect, type Page } from '@playwright/test';

/**
 * Build-time-compiled diagram fences (src/lib/remark-fence-svg.mjs): the
 * example note at /notes/diagrams-as-code/ carries ```tikz, ```typst and ```d2
 * fence, which the production build must turn into inline, theme-aware SVG.
 * These tests run against the built site (playwright's webServer serves
 * `astro preview`), so they exercise the real compile → cache → embed path.
 */
const NOTE = '/notes/diagrams-as-code/';

const pageInk = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).color);

test('Mermaid renders neo flowcharts and re-renders when the theme changes', async ({ page }) => {
  await page.goto('/notes/shipping-cadence/');
  const diagram = page.locator('.prose pre.mermaid').first();
  const svg = diagram.locator('svg');
  await expect(svg).toBeVisible();
  await expect(svg).toContainText('watch it land');
  await expect(svg.locator('.node').first()).toHaveAttribute('data-look', 'neo');
  const before = await svg.evaluate(el => el.outerHTML);

  await page.click('[data-theme-toggle]');
  await expect.poll(() => svg.evaluate(el => el.outerHTML)).not.toBe(before);
  await expect(svg).toContainText('watch it land');
  await expect(svg.locator('.node').first()).toHaveAttribute('data-look', 'neo');
  await expect(page.locator('.prose pre.mermaid-error')).toHaveCount(0);
});

test.describe('tikz fences', () => {
  test('compile to an inline svg with drawn geometry, leaving no code fence', async ({ page }) => {
    await page.goto(NOTE);
    const svg = page.locator('.prose svg.tikz-svg');
    await expect(svg).toBeVisible();
    // Real output, not an empty shell: the picture draws arrows as paths.
    expect(await svg.locator('path').count()).toBeGreaterThan(0);
    // The fence itself must be consumed — no highlighted tikz source left.
    expect(
      await page.locator('.prose pre code', { hasText: 'tikzpicture' }).count(),
    ).toBe(0);
  });

  test('labels get the page ink and the bundled Computer Modern webfonts', async ({ page }) => {
    await page.goto(NOTE);
    const label = page.locator('.prose svg.tikz-svg text').first();
    await expect(label).toBeVisible();
    // dvi2svg emits <text> without a fill attribute (svg default: black);
    // the engine CSS must recolor it to the page ink for dark-theme safety.
    expect(await label.evaluate((el) => getComputedStyle(el).fill)).toBe(await pageInk(page));
    // The TeX font families referenced by the svg must actually be loaded
    // from the @font-face set global.css imports out of node-tikzjax.
    const family = await label.getAttribute('font-family');
    expect(family).toBeTruthy();
    const loaded = await label.evaluate(async (el) => {
      await document.fonts.ready;
      return document.fonts.check(`10px ${el.getAttribute('font-family')}`);
    });
    expect(loaded).toBe(true);
  });

  test('ink follows the light/dark toggle', async ({ page }) => {
    await page.goto(NOTE);
    const stroked = page.locator('.prose svg.tikz-svg [stroke="currentColor"]').first();
    await expect(page.locator('.prose svg.tikz-svg')).toBeVisible();

    const strokeColor = () => stroked.evaluate((el) => getComputedStyle(el).stroke);
    const before = await strokeColor();
    await page.click('[data-theme-toggle]');
    await expect.poll(strokeColor).not.toBe(before);
    // Not just "changed" — the ink must track the page foreground.
    expect(await strokeColor()).toBe(await pageInk(page));
  });
});

test.describe('typst fences', () => {
  test('compile to an inline svg carrying the typeset content', async ({ page }) => {
    await page.goto(NOTE);
    const svg = page.locator('.prose svg.typst-svg');
    await expect(svg).toBeVisible();
    // Typst embeds the source text alongside the glyphs (selection layer),
    // so the typeset words are really in the page, not a rasterized shadow.
    await expect(svg).toContainText(/\w/);
    const box = await svg.boundingBox();
    expect(box!.width).toBeGreaterThan(50);
    expect(box!.height).toBeGreaterThan(20);
  });
});

test('D2 compiles to visible SVG with architecture labels and geometry', async ({ page }) => {
  await page.goto(NOTE);
  const svg = page.locator('.prose > svg.d2-svg');
  await expect(svg).toBeVisible();
  await expect(svg).toContainText('Teaman');
  expect(await svg.locator('path').count()).toBeGreaterThan(0);
  expect(await page.locator('.prose pre code', { hasText: 'engine.diagrams' }).count()).toBe(0);
  await page.click('[data-theme-toggle]');
  await expect(svg).toBeVisible();
  await expect(svg).toContainText('Teaman');
});

test('no diagram renders as a compile-error notice', async ({ page }) => {
  await page.goto(NOTE);
  await expect(page.locator('.prose svg.tikz-svg')).toBeVisible();
  expect(await page.locator('.prose pre.diagram-error').count()).toBe(0);
});
