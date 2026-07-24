import { test, expect, type Page } from '@playwright/test';
import type { EntryType } from '../src/lib/entries';

async function firstEntryHref(page: Page, type: EntryType): Promise<string | null> {
  await page.goto('/');
  const link = page.locator(`[data-entry][data-type="${type}"] .entry-title a`).first();
  if ((await link.count()) === 0) return null;
  return link.getAttribute('href');
}

/**
 * Daily notes carry their own `data-type="daily"`, so every `note` card links to
 * the standalone note layout at `/notes/`.
 */
async function firstStandaloneNoteCard(page: Page) {
  await page.goto('/');
  const card = page.locator('[data-entry][data-type="note"]').first();
  if ((await card.count()) === 0) return null;
  const href = await card.locator('.entry-title a').getAttribute('href');
  return href ? { card, href } : null;
}

test.describe('note page', () => {
  test('navigates to a note from the home page', async ({ page }) => {
    const result = await firstStandaloneNoteCard(page);
    test.skip(result === null, 'no standalone notes present');

    await result!.card.locator('.entry-title a').click();
    await expect(page).toHaveURL(/\/notes\/[^/]+\//);
  });

  test('shows the note title as a non-empty H1', async ({ page }) => {
    const result = await firstStandaloneNoteCard(page);
    test.skip(result === null, 'no standalone notes present');

    await page.goto(result!.href);
    const h1 = page.locator('h1.note-title');
    await expect(h1).toBeVisible();
    expect(((await h1.textContent()) ?? '').trim().length).toBeGreaterThan(0);
  });

  test('shows word count and reading time in the metadata strip', async ({ page }) => {
    const result = await firstStandaloneNoteCard(page);
    test.skip(result === null, 'no standalone notes present');

    await page.goto(result!.href);
    const meta = page.locator('.note-meta');
    await expect(meta).toContainText('words');
    await expect(meta).toContainText('min read');
  });

  test('shows the entry-card tags in the metadata strip', async ({ page }) => {
    const result = await firstStandaloneNoteCard(page);
    test.skip(result === null, 'no standalone notes present');

    const tags = ((await result!.card.getAttribute('data-tags')) ?? '').split(' ').filter(Boolean);
    test.skip(tags.length === 0, 'note has no tags');

    await page.goto(result!.href);
    const meta = page.locator('.note-meta');
    for (const tag of tags) await expect(meta).toContainText(`#${tag}`);
  });

  test('renders prose content', async ({ page }) => {
    const result = await firstStandaloneNoteCard(page);
    test.skip(result === null, 'no standalone notes present');

    await page.goto(result!.href);
    await expect(page.locator('.prose').first()).toBeVisible();
  });

  test('breadcrumb links back to the notes index', async ({ page }) => {
    const result = await firstStandaloneNoteCard(page);
    test.skip(result === null, 'no standalone notes present');

    await page.goto(result!.href);
    await page.click('.crumbs a[href="/notes/"]');
    await expect(page).toHaveURL('/notes/');
  });
});

test.describe('smart links', () => {
  // The bundled vault's shipping-cadence note carries one of every form.
  const NOTE = '/notes/shipping-cadence/';

  test('renders a labelled link as a stub + tail chip', async ({ page }) => {
    await page.goto(NOTE);
    const chip = page.locator('.tm-link[data-tm-kind="merge_request"]').first();
    await expect(chip).toBeVisible();
    await expect(chip.locator('.tm-ref')).toHaveText('!284');
    await expect(chip.locator('.tm-tail')).toHaveText('Surface cut items on the board');
  });

  test('renders a bare link as a stub carrying the qualified ref', async ({ page }) => {
    await page.goto(NOTE);
    const chip = page.locator('.tm-link.tm-bare[data-tm-kind="issue"][data-tm-service="gitlab"]').first();
    await expect(chip).toBeVisible();
    await expect(chip.locator('.tm-ref')).toHaveText('platform/api#77');
    await expect(chip.locator('.tm-tail')).toHaveCount(0);
  });

  test('recovers a tail from the confluence page slug', async ({ page }) => {
    await page.goto(NOTE);
    const chip = page.locator('.tm-link[data-tm-service="confluence"]').first();
    await expect(chip.locator('.tm-ref')).toHaveText('ENG');
    await expect(chip.locator('.tm-tail')).toHaveText('Shipping Cadence Retro');
  });

  test('the chip sits inside its own line box', async ({ page }) => {
    // The metric the design depends on: an inline-flex chip contributes its
    // height to the line box, so a too-tall chip would push the lines around it
    // apart. Guard it by comparing the chip against the paragraph's leading.
    await page.goto(NOTE);
    const chip = page.locator('.tm-link').first();
    const box = await chip.boundingBox();
    const lineHeight = await chip.evaluate((el) => {
      const p = el.closest('p') as HTMLElement;
      return parseFloat(getComputedStyle(p).lineHeight);
    });
    expect(box!.height).toBeLessThan(lineHeight);
  });

  test('keeps the link navigable, with the ref and host in its tooltip', async ({ page }) => {
    await page.goto(NOTE);
    const chip = page.locator('.tm-link[data-tm-service="jira"]').first();
    await expect(chip).toHaveAttribute('href', /atlassian\.net\/browse\/PLAT-412$/);
    await expect(chip).toHaveAttribute('title', 'PLAT-412 · acme.atlassian.net');
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
