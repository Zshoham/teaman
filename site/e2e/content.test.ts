import { test, expect } from '@playwright/test';

test.describe('note page', () => {
  test('navigates to the note from the home page', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-entry][data-type="note"] .entry-title a');
    await expect(page).toHaveURL(/\/notes\/vault-architecture\//);
  });

  test('shows the note title as an H1', async ({ page }) => {
    await page.goto('/notes/vault-architecture/');
    await expect(page.locator('h1.note-title')).toContainText('Vault Static Site Architecture');
  });

  test('shows word count and reading time in the metadata strip', async ({ page }) => {
    await page.goto('/notes/vault-architecture/');
    const meta = page.locator('.note-meta');
    await expect(meta).toContainText('words');
    await expect(meta).toContainText('min read');
  });

  test('shows tags in the metadata strip', async ({ page }) => {
    await page.goto('/notes/vault-architecture/');
    const meta = page.locator('.note-meta');
    await expect(meta).toContainText('#architecture');
    await expect(meta).toContainText('#infrastructure');
  });

  test('renders prose content', async ({ page }) => {
    await page.goto('/notes/vault-architecture/');
    // The note has section headings; at least one H2 should be in the prose.
    await expect(page.locator('.prose h2').first()).toBeVisible();
  });

  test('breadcrumb links back to the index', async ({ page }) => {
    await page.goto('/notes/vault-architecture/');
    await page.click('.crumbs a[href="/"]');
    await expect(page).toHaveURL('/');
  });
});

test.describe('guide page', () => {
  test('navigates to the guide root from the home page', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-entry][data-type="guide"] .entry-title a');
    await expect(page).toHaveURL(/\/guides\/using-this-system\//);
  });

  test('shows the chapter title as an H1', async ({ page }) => {
    await page.goto('/guides/using-this-system/');
    await expect(page.locator('h1.guide-title')).toBeVisible();
  });

  test('shows the guide eyebrow with chapter count', async ({ page }) => {
    await page.goto('/guides/using-this-system/');
    await expect(page.locator('.guide-eyebrow')).toContainText('chapter 1');
  });

  test('renders a table of contents sidebar', async ({ page }) => {
    await page.goto('/guides/using-this-system/');
    // The TOC should list all chapter links.
    const tocLinks = page.locator('.guide-toc a, nav[aria-label] a').first();
    await expect(tocLinks).toBeVisible();
  });

  test('chapter navigation: "next" link advances to chapter 2', async ({ page }) => {
    await page.goto('/guides/using-this-system/');
    await page.click('.guide-nav-link.next');
    await expect(page).toHaveURL(/\/guides\/using-this-system\/.+\//);
    await expect(page.locator('.guide-eyebrow')).toContainText('chapter 2');
  });
});
