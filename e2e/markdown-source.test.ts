import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('shows literal Markdown and downloads the original note', async ({ page }) => {
  await page.goto('/notes/');
  await page.locator('.entry-title a').first().click();
  const source = page.locator('.markdown-source');
  const trigger = source.getByRole('button', { name: 'View Markdown source' });
  await expect(trigger).toHaveAttribute('title', 'View Markdown source');
  const position = await page.locator('.note-meta').evaluate(meta => {
    const action = meta.querySelector('.markdown-source')!.getBoundingClientRect();
    const row = meta.getBoundingClientRect();
    return { rightGap: row.right - action.right, centerGap: Math.abs((row.top + row.bottom - action.top - action.bottom) / 2) };
  });
  expect(position.rightGap).toBeLessThan(2);
  expect(position.centerGap).toBeLessThan(2);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Markdown source' });
  const link = dialog.getByRole('link', { name: 'Download Markdown' });
  const href = await link.getAttribute('href');
  const response = await page.request.get(href!);
  expect(response.ok()).toBe(true);
  const original = await response.text();
  expect(original).toMatch(/^---/);
  await expect(dialog.locator('pre')).toHaveText(original);
  const downloaded = page.waitForEvent('download');
  await link.click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  expect(await readFile((await download.path())!, 'utf8')).toBe(original);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('references offer no Markdown source', async ({ page }) => {
  await page.goto('/references/rust-reference/');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.markdown-source')).toHaveCount(0);
  expect((await page.request.get('/source/references/rust-reference.md')).ok()).toBe(false);
});

test('can grab the source scrollbar before using the mouse wheel', async ({ page }) => {
  await page.goto('/notes/vault-architecture/');
  await page.getByRole('button', { name: 'View Markdown source' }).click();
  const dialog = page.getByRole('dialog', { name: 'Markdown source' });
  const viewport = dialog.locator('[data-slot="scroll-area-viewport"]');
  const thumb = dialog.locator('[data-orientation="vertical"] [data-slot="scroll-area-thumb"]');
  await expect(thumb).toBeVisible();
  // Measure the header only once the open animation has settled.
  await dialog.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(a => a.finished)));
  expect(await viewport.evaluate(element => element.scrollTop)).toBe(0);
  const box = (await thumb.boundingBox())!;
  const headerTop = (await dialog.getByRole('heading').boundingBox())!.y;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 100, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect((await dialog.getByRole('heading').boundingBox())!.y).toBe(headerTop);
});
