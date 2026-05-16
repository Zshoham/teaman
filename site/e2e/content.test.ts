import { test, expect, type Page } from '@playwright/test';
import type { EntryType } from '../src/lib/entries';

async function firstEntryHref(page: Page, type: EntryType): Promise<string | null> {
  await page.goto('/');
  const link = page.locator(`[data-entry][data-type="${type}"] .entry-title a`).first();
  if ((await link.count()) === 0) return null;
  return link.getAttribute('href');
}

test.describe('note page', () => {
  test('navigates to a note from the home page', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('[data-entry][data-type="note"]').first();
    test.skip((await card.count()) === 0, 'no notes present');

    await card.locator('.entry-title a').click();
    await expect(page).toHaveURL(/\/notes\/[^/]+\//);
  });

  test('shows the note title as a non-empty H1', async ({ page }) => {
    const href = await firstEntryHref(page, 'note');
    test.skip(href === null, 'no notes present');

    await page.goto(href!);
    const h1 = page.locator('h1.note-title');
    await expect(h1).toBeVisible();
    expect(((await h1.textContent()) ?? '').trim().length).toBeGreaterThan(0);
  });

  test('shows word count and reading time in the metadata strip', async ({ page }) => {
    const href = await firstEntryHref(page, 'note');
    test.skip(href === null, 'no notes present');

    await page.goto(href!);
    const meta = page.locator('.note-meta');
    await expect(meta).toContainText('words');
    await expect(meta).toContainText('min read');
  });

  test('shows the entry-card tags in the metadata strip', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('[data-entry][data-type="note"]').first();
    test.skip((await card.count()) === 0, 'no notes present');

    const tags = ((await card.getAttribute('data-tags')) ?? '').split(' ').filter(Boolean);
    test.skip(tags.length === 0, 'note has no tags');

    const href = await card.locator('.entry-title a').getAttribute('href');
    await page.goto(href!);
    const meta = page.locator('.note-meta');
    for (const tag of tags) await expect(meta).toContainText(`#${tag}`);
  });

  test('renders prose content', async ({ page }) => {
    const href = await firstEntryHref(page, 'note');
    test.skip(href === null, 'no notes present');

    await page.goto(href!);
    await expect(page.locator('.prose').first()).toBeVisible();
  });

  test('breadcrumb links back to the index', async ({ page }) => {
    const href = await firstEntryHref(page, 'note');
    test.skip(href === null, 'no notes present');

    await page.goto(href!);
    await page.click('.crumbs a[href="/"]');
    await expect(page).toHaveURL('/');
  });
});

test.describe('guide page', () => {
  test('navigates to a guide from the home page', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('[data-entry][data-type="guide"]').first();
    test.skip((await card.count()) === 0, 'no guides present');

    await card.locator('.entry-title a').click();
    await expect(page).toHaveURL(/\/guides\/[^/]+\//);
  });

  test('shows the chapter title as an H1', async ({ page }) => {
    const href = await firstEntryHref(page, 'guide');
    test.skip(href === null, 'no guides present');

    await page.goto(href!);
    await expect(page.locator('h1.guide-title')).toBeVisible();
  });

  test('shows the guide eyebrow with a chapter label', async ({ page }) => {
    const href = await firstEntryHref(page, 'guide');
    test.skip(href === null, 'no guides present');

    await page.goto(href!);
    await expect(page.locator('.guide-eyebrow')).toContainText(/chapter\s+\d+/i);
  });

  test('renders a table of contents sidebar', async ({ page }) => {
    const href = await firstEntryHref(page, 'guide');
    test.skip(href === null, 'no guides present');

    await page.goto(href!);
    const tocLink = page.locator('.guide-toc a, nav[aria-label] a').first();
    await expect(tocLink).toBeVisible();
  });

  test('chapter navigation: "next" link advances to the next chapter', async ({ page }) => {
    const href = await firstEntryHref(page, 'guide');
    test.skip(href === null, 'no guides present');

    await page.goto(href!);
    const next = page.locator('.guide-nav-link.next');
    test.skip((await next.count()) === 0, 'guide has only one chapter');

    const eyebrow = page.locator('.guide-eyebrow');
    const before = parseInt(
      ((await eyebrow.textContent()) ?? '').match(/chapter\s+(\d+)/i)?.[1] ?? '0',
      10,
    );

    await next.click();
    await expect(page).toHaveURL(/\/guides\/[^/]+\/.+\//);
    await expect(eyebrow).toContainText(/chapter\s+\d+/i);

    const after = parseInt(
      ((await eyebrow.textContent()) ?? '').match(/chapter\s+(\d+)/i)?.[1] ?? '0',
      10,
    );
    expect(after).toBe(before + 1);
  });
});
