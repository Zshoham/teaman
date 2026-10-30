import { test, expect, type Page } from '@playwright/test';
import type { EntryType } from '../src/lib/entries';

/** Section id → the entry type its index page is scoped to. */
const SECTIONS: { id: string; type: EntryType; path: RegExp }[] = [
  { id: 'notes', type: 'note', path: /\/notes\/$/ },
  { id: 'references', type: 'reference', path: /\/references\/$/ },
  { id: 'guides', type: 'guide', path: /\/guides\/$/ },
  { id: 'slides', type: 'slides', path: /\/slides\/$/ },
];

function navLink(page: Page, id: string) {
  return page.locator(`[data-nav-section="${id}"]`);
}

test.describe('section nav', () => {
  test('links every content section from the header', async ({ page }) => {
    await page.goto('/');
    for (const { id } of SECTIONS) {
      await expect(navLink(page, id)).toBeVisible();
    }
    await expect(navLink(page, 'daily')).toBeVisible();
    await expect(navLink(page, 'decisions')).toBeVisible();
  });

  for (const { id, type, path } of SECTIONS) {
    test(`${id} nav link opens an index of only ${type} entries`, async ({ page }) => {
      await page.goto('/');
      await navLink(page, id).click();
      await expect(page).toHaveURL(path);

      const entries = page.locator('[data-entry]');
      const total = await entries.count();
      expect(total).toBeGreaterThan(0);
      expect(await page.locator(`[data-entry][data-type="${type}"]`).count()).toBe(total);
    });

    test(`${id} nav link is marked current on its own page`, async ({ page }) => {
      await page.goto(`/${id}/`);
      await expect(navLink(page, id)).toHaveAttribute('aria-current', 'page');
      await expect(navLink(page, 'decisions')).not.toHaveAttribute('aria-current', 'page');
    });
  }

  test('entry links from an index page resolve', async ({ page }) => {
    await page.goto('/notes/');
    const link = page.locator('[data-entry] .entry-title a').first();
    const href = await link.getAttribute('href');
    expect(href).toBeTruthy();
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
  });

  for (const path of ['/notes/', '/references/', '/guides/', '/slides/']) {
    test(`${path} opens with the tag filter ready and no add-filter menu`, async ({ page }) => {
      await page.goto(path);
      const toolbar = page.locator('[data-filter-toolbar]');
      await expect(toolbar.getByText('Tag', { exact: true })).toBeVisible();
      await expect(toolbar.getByRole('button', { name: 'Select...' })).toBeVisible();
      // The list is already scoped to one type, so neither the Type field nor
      // an add-filter menu of one item has anything to offer.
      await expect(toolbar.getByText('Type', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Filter', exact: true })).toHaveCount(0);
    });
  }

  test('picking a tag on an index page filters the list', async ({ page }) => {
    await page.goto('/notes/');
    const total = await page.locator('[data-entry]').count();
    await page.locator('[data-filter-toolbar]').getByRole('button', { name: 'Select...' }).click();

    const option = page.getByRole('option').first();
    const label = (await option.textContent()) ?? '';
    const tag = label.replace(/^#/, '').replace(/\s*\(\d+\)\s*$/, '').trim();
    const expected = Number(label.match(/\((\d+)\)\s*$/)?.[1] ?? 0);
    expect(expected).toBeGreaterThan(0);

    await option.click();
    await page.keyboard.press('Escape');

    const visible = page.locator('[data-entry]:not([hidden])');
    await expect(visible).toHaveCount(Math.min(expected, 10));
    expect(await visible.count()).toBeLessThan(total + 1);
    for (const el of await visible.all()) {
      expect((await el.getAttribute('data-tags'))?.split(' ')).toContain(tag);
    }
  });
});

test.describe('section nav on mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('collapses the content sections into the browse menu', async ({ page }) => {
    await page.goto('/');
    for (const { id } of SECTIONS) {
      await expect(navLink(page, id)).toBeHidden();
    }
    await expect(navLink(page, 'daily')).toBeVisible();

    const trigger = page.getByRole('button', { name: 'Browse sections' });
    await expect(trigger).toBeVisible();
    // SSR makes the trigger visible before the React island can handle clicks.
    await expect(page.locator('astro-island').filter({ has: trigger })).not.toHaveAttribute('ssr');
    await trigger.click();
    await page.getByRole('menuitem', { name: 'guides' }).click();
    await expect(page).toHaveURL(/\/guides\/$/);
  });

  test('names the active section on the menu trigger', async ({ page }) => {
    await page.goto('/notes/');
    await expect(page.getByRole('button', { name: 'Browse sections' })).toContainText('notes');
  });
});

test('tablet header separates branding, navigation, and search', async ({ page }) => {
  for (const width of [768, 800, 1023, 1024, 1279, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const collisions = await page.locator('#site-header').evaluate(header => {
      const brand = header.querySelector('.brand')!.getBoundingClientRect();
      const nav = header.querySelector('nav')!.getBoundingClientRect();
      const search = header.querySelector('pagefind-modal-trigger')!.getBoundingClientRect();
      // Below lg the nav occupies a second row; sharing its horizontal
      // space with the brand or search is only a collision on the same row.
      const overlaps = (a: DOMRect, b: DOMRect) =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return overlaps(brand, nav) || overlaps(nav, search) || overlaps(brand, search);
    });
    expect(collisions, `header at ${width}px`).toBe(false);
    if (width < 1280) await expect(page.getByRole('button', { name: 'Browse sections' })).toBeVisible();
  }
});

test('phone home shows entries before expanding quick links', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const quickLinks = page.locator('[data-mobile-quick-links]');
  await expect(quickLinks).not.toHaveAttribute('open');
  const firstTitle = page.locator('[data-entry] .entry-title').first();
  await expect(firstTitle).toBeInViewport();
  await quickLinks.locator('summary').click();
  const links = quickLinks.getByRole('link');
  expect(await links.count()).toBeGreaterThan(0);
  for (const link of await links.all()) await expect(link).toBeVisible();
});

test('production search keeps the compact mobile control', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const trigger = page.locator('pagefind-modal-trigger .pf-trigger-btn');
  await expect(trigger).toHaveAccessibleName('Search the vault');
  const bounds = await trigger.boundingBox();
  expect(bounds?.width).toBe(44);
  expect(bounds?.height).toBe(44);
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
