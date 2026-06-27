import { test, expect, type Page } from '@playwright/test';

/**
 * Slides are built by `build:slides` (Slidev) and served from the production
 * build the e2e webServer previews, so these run against the real deck SPA.
 *
 * The decks build with a relative base + hash routing (see slidevBuildArgs).
 * Without that, Slidev double-applies a sub-path base on in-app navigation —
 * "next" lands on /slides/intro/slides/intro/2 and 404s — and deep links break
 * on a static host with no SPA fallback. These lock that behaviour in.
 */

const DECK = '/slides/intro/';

async function openDeck(page: Page): Promise<void> {
  await page.goto(DECK);
  // Hash routing: the deck root resolves to the first slide.
  await expect(page).toHaveURL(/\/slides\/intro\/#\/1$/);
  await expect(page.getByRole('heading', { name: 'Teaman' })).toBeVisible();
}

test.describe('slides', () => {
  test('the deck opens on the first slide', async ({ page }) => {
    await openDeck(page);
  });

  test('advancing goes to the next slide without doubling the base', async ({ page }) => {
    await openDeck(page);
    await page.keyboard.press('ArrowRight');
    // The fix: a clean hash route #/2 — NOT /slides/intro/#/slides/intro/2.
    await expect(page).toHaveURL(/\/slides\/intro\/#\/2$/);
    await expect(page.getByRole('heading', { name: 'The Problem' })).toBeVisible();
    await expect(page.getByText('not found')).toHaveCount(0);
  });

  test('deep-linking straight to a slide works (no SPA fallback needed)', async ({ page }) => {
    await page.goto(`${DECK}#/4`);
    await expect(page).toHaveURL(/\/slides\/intro\/#\/4$/);
    await expect(page.getByRole('heading', { name: 'How It Works' })).toBeVisible();
    await expect(page.getByText('not found')).toHaveCount(0);
  });

  test('reloading on a deep slide stays on that slide', async ({ page }) => {
    await page.goto(`${DECK}#/3`);
    await expect(page.getByRole('heading', { name: 'Three Types of Content' })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/slides\/intro\/#\/3$/);
    await expect(page.getByRole('heading', { name: 'Three Types of Content' })).toBeVisible();
  });

  test('presenter mode advances without a depth-relative 404', async ({ page }) => {
    // getSlidePath would otherwise hand router.push a relative `./presenter/N`,
    // which resolves against `/presenter/1` → `/presenter/presenter/N` (404).
    // The build-time patch makes it an absolute `/presenter/N` instead.
    await page.goto(`${DECK}#/presenter/1`);
    await expect(page).toHaveURL(/\/slides\/intro\/#\/presenter\/1$/);
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/\/slides\/intro\/#\/presenter\/[2-9]\d*$/);
    await expect(page.getByText('not found')).toHaveCount(0);
  });

  test('picking a slide from the presenter overview navigates (the reported 404)', async ({ page }) => {
    // The exact flow the user hit: enter presenter mode, open the overview (`o`),
    // click a slide card. QuickOverview calls nav.go(no) → router.push with the
    // presenter path; pre-patch that 404'd, now it lands on /presenter/<no>.
    await page.goto(`${DECK}#/presenter/1`);
    // Wait for the presenter view to mount before the `o` keypress registers.
    await expect(page.locator('.slidev-slide-container').first()).toBeVisible();
    await page.keyboard.press('o');
    const cards = page.locator('div.border.rounded.inline-block');
    await expect(cards.first()).toBeVisible();
    await cards.nth(2).click(); // the third slide
    await expect(page).toHaveURL(/\/slides\/intro\/#\/presenter\/3$/);
    await expect(page.getByText('not found')).toHaveCount(0);
  });

  test('the deck uses the teaman theme (serif display headings)', async ({ page }) => {
    await openDeck(page);
    const font = await page
      .getByRole('heading', { name: 'Teaman' })
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(font).toContain('Source Serif 4');
  });
});
