import { test, expect, type Page } from '@playwright/test';
import type { EntryType } from '../src/lib/entries';

const TYPES = ['note', 'guide', 'slides'] as const satisfies readonly EntryType[];

const STAT_LABEL: Record<EntryType, string> = {
  note: 'notes',
  guide: 'guides',
  slides: 'slides',
};

async function entryCount(page: Page, type?: EntryType): Promise<number> {
  const sel = type ? `[data-entry][data-type="${type}"]` : '[data-entry]';
  return page.locator(sel).count();
}

async function statCount(page: Page, label: string): Promise<number> {
  const row = page.locator('.stat-row').filter({ hasText: label });
  const text = (await row.textContent()) ?? '';
  const match = text.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
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

async function expectFilterVisibility(page: Page, active: EntryType) {
  for (const t of TYPES) {
    const entries = page.locator(`[data-entry][data-type="${t}"]`);
    const n = await entries.count();
    for (let i = 0; i < n; i++) {
      if (t === active) await expect(entries.nth(i)).toBeVisible();
      else await expect(entries.nth(i)).toBeHidden();
    }
  }
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

  test('hero stats match the rendered entry counts per type', async ({ page }) => {
    for (const t of TYPES) {
      const rendered = await entryCount(page, t);
      const stat = await statCount(page, STAT_LABEL[t]);
      expect(stat).toBe(rendered);
    }
  });

  // ── Filter ────────────────────────────────────────────────────────────────

  test('filter: notes pill shows only note entries', async ({ page }) => {
    test.skip((await entryCount(page, 'note')) === 0, 'no notes present');
    await page.click('[data-filter="note"]');
    await expectFilterVisibility(page, 'note');
  });

  test('filter: guides pill shows only guide entries', async ({ page }) => {
    test.skip((await entryCount(page, 'guide')) === 0, 'no guides present');
    await page.click('[data-filter="guide"]');
    await expectFilterVisibility(page, 'guide');
  });

  test('filter: slides pill shows only slides entries', async ({ page }) => {
    test.skip((await entryCount(page, 'slides')) === 0, 'no slides present');
    await page.click('[data-filter="slides"]');
    await expectFilterVisibility(page, 'slides');
  });

  test('filter: all pill restores all entries after a type filter', async ({ page }) => {
    const picked = await pickType(page);
    test.skip(picked === null, 'no entries present');

    await page.click(`[data-filter="${picked}"]`);
    await page.click('[data-filter="all"]');

    for (const entry of await page.locator('[data-entry]').all()) {
      await expect(entry).toBeVisible();
    }
  });

  test('filter: active pill has aria-pressed="true"', async ({ page }) => {
    const picked = await pickType(page);
    test.skip(picked === null, 'no entries present');

    await page.click(`[data-filter="${picked}"]`);

    await expect(page.locator(`[data-filter="${picked}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('[data-filter="all"]')).toHaveAttribute('aria-pressed', 'false');
    for (const t of TYPES) {
      if (t === picked) continue;
      await expect(page.locator(`[data-filter="${t}"]`)).toHaveAttribute('aria-pressed', 'false');
    }
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

  test('tag: active-tag chip appears with the selected tag name', async ({ page }) => {
    const tag = await pickTag(page);
    test.skip(tag === null, 'no tags present');

    await page.click(`[data-tag="${tag}"]`);

    await expect(page.locator('[data-active-tag]')).toBeVisible();
    await expect(page.locator('[data-active-tag-name]')).toHaveText(`#${tag}`);
  });

  test('tag: clear button dismisses the filter and hides the chip', async ({ page }) => {
    const tag = await pickTag(page);
    test.skip(tag === null, 'no tags present');

    await page.click(`[data-tag="${tag}"]`);
    await page.click('[data-tag-clear]');

    await expect(page.locator('[data-active-tag]')).toBeHidden();
    for (const entry of await page.locator('[data-entry]').all()) {
      await expect(entry).toBeVisible();
    }
  });

  test('tag: clicking the same tag twice clears it (toggle behaviour)', async ({ page }) => {
    const tag = await pickTag(page);
    test.skip(tag === null, 'no tags present');

    await page.click(`[data-tag="${tag}"]`);
    await page.click(`[data-tag="${tag}"]`);

    await expect(page.locator('[data-active-tag]')).toBeHidden();
    for (const entry of await page.locator('[data-entry]').all()) {
      await expect(entry).toBeVisible();
    }
  });

  test('tag: topic button gains is-active class when selected', async ({ page }) => {
    const tag = await pickTag(page);
    test.skip(tag === null, 'no tags present');

    await page.click(`[data-tag="${tag}"]`);
    await expect(page.locator(`[data-tag="${tag}"]`).first()).toHaveClass(/is-active/);
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

    await page.click(`[data-filter="${pickedType}"]`);
    await page.click(`[data-tag="${pickedTag}"]`);

    for (let i = 0; i < n; i++) {
      const entry = all.nth(i);
      const type = await entry.getAttribute('data-type');
      const tags = ((await entry.getAttribute('data-tags')) ?? '').split(' ').filter(Boolean);
      const shouldBeVisible = type === pickedType && tags.includes(pickedTag!);
      if (shouldBeVisible) await expect(entry).toBeVisible();
      else await expect(entry).toBeHidden();
    }
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
