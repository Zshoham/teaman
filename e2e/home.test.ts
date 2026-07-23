import { test, expect, type Page } from '@playwright/test';
import type { EntryType } from '../src/lib/entries';

const TYPES = ['note', 'guide', 'slides', 'decision'] as const satisfies readonly EntryType[];

async function entryCount(page: Page, type?: EntryType): Promise<number> {
  const sel = type ? `[data-entry][data-type="${type}"]` : '[data-entry]';
  return page.locator(sel).count();
}

const TYPE_OPTION: Record<EntryType, RegExp> = {
  note: /^Notes \(/,
  guide: /^Guides \(/,
  slides: /^Slides \(/,
  decision: /^Decisions \(/,
};

async function openFilterField(page: Page, field: 'Type' | 'Tag') {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('option', { name: field, exact: true }).hover();
}

async function selectFilterTerm(
  page: Page,
  field: 'Type' | 'Tag',
  option: string | RegExp,
) {
  await openFilterField(page, field);
  await page.getByRole('option', { name: option }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}

async function pickType(page: Page): Promise<EntryType | null> {
  for (const t of TYPES) if ((await entryCount(page, t)) > 0) return t;
  return null;
}

async function pickTag(page: Page): Promise<string | null> {
  const el = page.locator('[data-tag]').first();
  if ((await el.count()) === 0) return null;
  return el.getAttribute('data-tag');
}

/** The home list is paginated, so not every matching entry is on-screen. */
const HOME_PAGE_SIZE = 10;

/**
 * After a type filter: no off-type entry is visible, and at least one on-type
 * entry is visible (assuming the type has any entries at all).
 */
async function expectFilterVisibility(page: Page, active: EntryType) {
  for (const t of TYPES) {
    if (t === active) continue;
    const off = page.locator(`[data-entry][data-type="${t}"]`);
    const n = await off.count();
    for (let i = 0; i < n; i++) await expect(off.nth(i)).toBeHidden();
  }
  const onType = page.locator(`[data-entry][data-type="${active}"]:not([hidden])`);
  expect(await onType.count()).toBeGreaterThan(0);
}

/** Visible entries when no filter/tag is applied: up to HOME_PAGE_SIZE. */
async function expectUnfilteredVisible(page: Page) {
  const total = await page.locator('[data-entry]').count();
  await expect(page.locator('[data-entry]:not([hidden])')).toHaveCount(
    Math.min(total, HOME_PAGE_SIZE)
  );
}

test.describe('home page', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage so theme state never bleeds between tests.
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  // ── Layout & content ──────────────────────────────────────────────────────

  test('shows the brand name and tagline', async ({ page }) => {
    await expect(page.locator('.brand-name')).toBeVisible();
    await expect(page.locator('.brand-tagline')).toBeVisible();
  });

  test('renders at least one entry on initial load', async ({ page }) => {
    expect(await entryCount(page)).toBeGreaterThan(0);
  });

  test('per-type entry counts sum to the total', async ({ page }) => {
    const total = await entryCount(page);
    let sum = 0;
    for (const t of TYPES) sum += await entryCount(page, t);
    expect(sum).toBe(total);
  });

  test('type filter counts match the rendered entry counts', async ({ page }) => {
    await openFilterField(page, 'Type');
    for (const t of TYPES) {
      const rendered = await entryCount(page, t);
      if (rendered === 0) continue;
      const text = (await page.getByRole('option', { name: TYPE_OPTION[t] }).textContent()) ?? '';
      const match = text.match(/\((\d+)\)$/);
      const stat = match ? parseInt(match[1], 10) : 0;
      expect(stat).toBe(rendered);
    }
  });

  // ── Filter ────────────────────────────────────────────────────────────────

  test('filter: notes term shows only note entries', async ({ page }) => {
    test.skip((await entryCount(page, 'note')) === 0, 'no notes present');
    await selectFilterTerm(page, 'Type', TYPE_OPTION.note);
    await expectFilterVisibility(page, 'note');
  });

  test('filter: guides term shows only guide entries', async ({ page }) => {
    test.skip((await entryCount(page, 'guide')) === 0, 'no guides present');
    await selectFilterTerm(page, 'Type', TYPE_OPTION.guide);
    await expectFilterVisibility(page, 'guide');
  });

  test('filter: slides term shows only slides entries', async ({ page }) => {
    test.skip((await entryCount(page, 'slides')) === 0, 'no slides present');
    await selectFilterTerm(page, 'Type', TYPE_OPTION.slides);
    await expectFilterVisibility(page, 'slides');
  });

  test('filter: removing a filter restores all entries', async ({ page }) => {
    const picked = await pickType(page);
    test.skip(picked === null, 'no entries present');

    await selectFilterTerm(page, 'Type', TYPE_OPTION[picked!]);
    await page.getByRole('button', { name: 'Remove Type filter' }).click();

    await expectUnfilteredVisible(page);
  });

  test('filter: searches and selects multiple type terms', async ({ page }) => {
    const available: EntryType[] = [];
    for (const type of TYPES) {
      if ((await entryCount(page, type)) > 0) available.push(type);
    }
    test.skip(available.length < 2, 'fewer than two entry types present');

    await openFilterField(page, 'Type');
    const termSearch = page.getByPlaceholder('Search type...');
    await expect(termSearch).toBeVisible();
    await termSearch.fill(available[0]);
    await page.getByRole('option', { name: TYPE_OPTION[available[0]] }).click();
    await termSearch.fill(available[1]);
    await page.getByRole('option', { name: TYPE_OPTION[available[1]] }).click();

    const expected = await entryCount(page, available[0]) + await entryCount(page, available[1]);
    await expect(page.locator('[data-entry]:not([hidden])')).toHaveCount(
      Math.min(expected, HOME_PAGE_SIZE),
    );
    await expect(page.getByRole('button', { name: 'Filter', exact: true })).toBeVisible();
  });

  // ── Sort ──────────────────────────────────────────────────────────────────

  test('sort: arrow starts pointing down (newest first)', async ({ page }) => {
    await expect(page.locator('.sort-arrow')).toHaveText('↓');
  });

  test('sort: arrow points up after clicking the sort toggle', async ({ page }) => {
    await page.click('[data-sort-toggle]');
    await expect(page.locator('.sort-arrow')).toHaveText('↑');
  });

  test('sort: aria-label updates to reflect the current direction', async ({ page }) => {
    await page.click('[data-sort-toggle]');
    await expect(page.locator('[data-sort-toggle]')).toHaveAttribute(
      'aria-label', 'Sort: oldest first'
    );

    await page.click('[data-sort-toggle]');
    await expect(page.locator('[data-sort-toggle]')).toHaveAttribute(
      'aria-label', 'Sort: newest first'
    );
  });

  // ── Tag ───────────────────────────────────────────────────────────────────

  test('tag: clicking a tag filters to entries that include it', async ({ page }) => {
    const tag = await pickTag(page);
    test.skip(tag === null, 'no tags present');

    await page.click(`[data-tag="${tag}"]`);

    const all = page.locator('[data-entry]');
    const n = await all.count();
    for (let i = 0; i < n; i++) {
      const entry = all.nth(i);
      const tags = ((await entry.getAttribute('data-tags')) ?? '').split(' ').filter(Boolean);
      if (tags.includes(tag!)) await expect(entry).toBeVisible();
      else await expect(entry).toBeHidden();
    }
  });

  test('tag: selecting an entry tag creates the shared Tag filter', async ({ page }) => {
    const tag = await pickTag(page);
    test.skip(tag === null, 'no tags present');

    await page.click(`[data-tag="${tag}"]`);

    await expect(page.getByRole('button', { name: 'Remove Tag filter' })).toBeVisible();
    await expect(page.locator('[data-filter-toolbar]')).toContainText(`#${tag}`);
  });

  test('tag: remove button clears the filter', async ({ page }) => {
    const tag = await pickTag(page);
    test.skip(tag === null, 'no tags present');

    await page.click(`[data-tag="${tag}"]`);
    await page.getByRole('button', { name: 'Remove Tag filter' }).click();

    await expect(page.getByRole('button', { name: 'Remove Tag filter' })).toHaveCount(0);
    await expectUnfilteredVisible(page);
  });

  test('tag: clicking the same tag twice clears it (toggle behaviour)', async ({ page }) => {
    const tag = await pickTag(page);
    test.skip(tag === null, 'no tags present');

    await page.click(`[data-tag="${tag}"]`);
    await page.click(`[data-tag="${tag}"]`);

    await expect(page.getByRole('button', { name: 'Remove Tag filter' })).toHaveCount(0);
    await expectUnfilteredVisible(page);
  });

  test('filter trigger remains after both Type and Tag are selected', async ({ page }) => {
    const tag = await pickTag(page);
    test.skip(tag === null, 'no tags present');
    const entry = page.locator(`[data-entry][data-tags~="${tag}"]`).first();
    const type = await entry.getAttribute('data-type') as EntryType | null;
    test.skip(type === null, 'tagged entry has no type');

    await selectFilterTerm(page, 'Type', TYPE_OPTION[type!]);
    await page.click(`[data-tag="${tag}"]`);
    await expect(page.getByRole('button', { name: 'Remove Type filter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Tag filter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Filter', exact: true })).toBeVisible();
  });

  // ── Filter + tag combination ──────────────────────────────────────────────

  test('filter + tag: both constraints apply simultaneously', async ({ page }) => {
    // Find any entry that carries at least one tag, then use its type+tag.
    const all = page.locator('[data-entry]');
    const n = await all.count();
    let pickedType: string | null = null;
    let pickedTag: string | null = null;
    for (let i = 0; i < n; i++) {
      const entry = all.nth(i);
      const tags = ((await entry.getAttribute('data-tags')) ?? '').split(' ').filter(Boolean);
      if (tags.length > 0) {
        pickedType = await entry.getAttribute('data-type');
        pickedTag = tags[0];
        break;
      }
    }
    test.skip(pickedType === null || pickedTag === null, 'no entry with a tag');

    await selectFilterTerm(page, 'Type', TYPE_OPTION[pickedType as EntryType]);
    await page.click(`[data-tag="${pickedTag}"]`);

    // Paging caps how many matches show at once, but: no off-criteria entry
    // should be visible, and every visible entry must match BOTH constraints.
    for (let i = 0; i < n; i++) {
      const entry = all.nth(i);
      const type = await entry.getAttribute('data-type');
      const tags = ((await entry.getAttribute('data-tags')) ?? '').split(' ').filter(Boolean);
      const matches = type === pickedType && tags.includes(pickedTag!);
      if (!matches) await expect(entry).toBeHidden();
    }
    const visible = page.locator('[data-entry]:not([hidden])');
    expect(await visible.count()).toBeGreaterThan(0);
  });

  // ── Load more ─────────────────────────────────────────────────────────────

  test('load more: button reveals additional entries when clicked', async ({ page }) => {
    const total = await page.locator('[data-entry]').count();
    test.skip(total <= HOME_PAGE_SIZE, 'not enough entries to paginate');

    await expectUnfilteredVisible(page);
    const button = page.locator('[data-load-more]');
    await expect(button).toBeVisible();

    await button.click();
    await expect(page.locator('[data-entry]:not([hidden])')).toHaveCount(
      Math.min(total, HOME_PAGE_SIZE * 2)
    );
  });

  test('load more: hides itself after every match is revealed', async ({ page }) => {
    const total = await page.locator('[data-entry]').count();
    test.skip(total <= HOME_PAGE_SIZE, 'not enough entries to paginate');

    const button = page.locator('[data-load-more]');
    const visibleEntries = page.locator('[data-entry]:not([hidden])');
    let expectedVisible = Math.min(total, HOME_PAGE_SIZE);
    while (expectedVisible < total) {
      await expect(button).toBeVisible();
      await button.click();
      expectedVisible = Math.min(total, expectedVisible + HOME_PAGE_SIZE);
      await expect(visibleEntries).toHaveCount(expectedVisible);
    }
    await expect(button).toBeHidden();
  });

  test('load more: removing filters resets paging back to the first page', async ({ page }) => {
    const total = await page.locator('[data-entry]').count();
    test.skip(total <= HOME_PAGE_SIZE, 'not enough entries to paginate');
    const picked = await pickType(page);
    test.skip(picked === null, 'no entries present');

    await page.locator('[data-load-more]').click();
    await expect
      .poll(() => page.locator('[data-entry]:not([hidden])').count())
      .toBeGreaterThan(HOME_PAGE_SIZE);

    await selectFilterTerm(page, 'Type', TYPE_OPTION[picked!]);
    await page.getByRole('button', { name: 'Remove Type filter' }).click();
    await expectUnfilteredVisible(page);
  });

  // ── Theme ─────────────────────────────────────────────────────────────────

  test('theme: toggle applies data-theme="dark" on first click', async ({ page }) => {
    await page.click('[data-theme-toggle]');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('theme: toggle flips to light mode on second click', async ({ page }) => {
    await page.click('[data-theme-toggle]');
    await page.click('[data-theme-toggle]');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('theme: preference is persisted in localStorage', async ({ page }) => {
    await page.click('[data-theme-toggle]');
    const stored = await page.evaluate(() => localStorage.getItem('vault-theme'));
    expect(stored).toBe('dark');
  });

  test('theme: persisted preference is restored on page reload', async ({ page }) => {
    await page.click('[data-theme-toggle]'); // → dark, stored in localStorage
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
