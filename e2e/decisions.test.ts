import { expect, test } from '@playwright/test';

test.describe('architecture decisions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/decisions/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('renders the ReUI timeline and status badges', async ({ page }) => {
    await expect(page.locator('[data-slot="timeline"]')).toBeVisible();
    expect(await page.locator('[data-slot="timeline-item"]').count()).toBeGreaterThan(0);
    expect(await page.locator('[data-adr-status]').count()).toBeGreaterThan(0);
  });

  test('filters decisions by status and removes the filter', async ({ page }) => {
    const allCount = await page.locator('[data-adr-card]').count();
    const acceptedCount = await page.locator('[data-adr-status="accepted"]').count();

    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.getByRole('option', { name: 'Status' }).hover();
    await page.getByRole('option', { name: /^Accepted/ }).click();

    await expect(page.locator('[data-adr-card]')).toHaveCount(acceptedCount);
    await page.getByRole('button', { name: 'Remove Status filter' }).click();
    await expect(page.locator('[data-adr-card]')).toHaveCount(allCount);
  });

  test('searches and selects multiple terms from one filter field', async ({ page }) => {
    const acceptedCount = await page.locator('[data-adr-status="accepted"]').count();
    const proposedCount = await page.locator('[data-adr-status="proposed"]').count();

    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await expect(page.getByPlaceholder('Filter...')).toBeVisible();
    await page.getByRole('option', { name: 'Status' }).hover();

    const termSearch = page.getByPlaceholder('Search status...');
    await expect(termSearch).toBeVisible();
    await termSearch.fill('accept');
    await page.getByRole('option', { name: /^Accepted/ }).click();
    await termSearch.fill('propos');
    await page.getByRole('option', { name: /^Proposed/ }).click();

    await expect(page.locator('[data-adr-card]')).toHaveCount(
      acceptedCount + proposedCount,
    );
    await expect(page.getByRole('button', { name: 'Filter', exact: true })).toBeVisible();
  });

  test('reopens an active filter with its terms selected and can deselect them', async ({ page }) => {
    const allCount = await page.locator('[data-adr-card]').count();

    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.getByRole('option', { name: 'Status' }).hover();
    await page.getByRole('option', { name: /^Accepted/ }).click();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.getByRole('option', { name: 'Status' }).hover();
    const accepted = page.getByRole('option', { name: /^Accepted/ });
    await expect(accepted).toHaveAttribute('aria-checked', 'true');
    await accepted.click();

    await expect(page.locator('[data-adr-card]')).toHaveCount(allCount);
    await expect(page.getByRole('button', { name: 'Remove Status filter' })).toHaveCount(0);
  });

  test('keeps active filters reachable on a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.getByRole('option', { name: 'Status' }).hover();
    await page.getByRole('option', { name: /^Superseded/ }).click();

    const filterStrip = page.locator('[data-filter-scroll]');
    const viewport = filterStrip.locator('[data-slot="scroll-area-viewport"]');
    const removeButton = page.getByRole('button', { name: 'Remove Status filter' });
    await expect(
      filterStrip.locator('[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]'),
    ).toBeAttached();

    const sizes = await viewport.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(sizes.scrollWidth).toBeGreaterThan(sizes.clientWidth);

    await removeButton.evaluate((element) => {
      element.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
    const isReachable = await viewport.evaluate((scrollViewport) => {
      const button = scrollViewport.querySelector<HTMLElement>(
        'button[aria-label="Remove Status filter"]',
      );
      if (!button) return false;
      const buttonRect = button.getBoundingClientRect();
      const stripRect = scrollViewport.getBoundingClientRect();
      return buttonRect.left >= stripRect.left && buttonRect.right <= stripRect.right;
    });
    expect(isReachable).toBe(true);
  });

  test('keeps the grouped layout and ADR detail dialog working', async ({ page }) => {
    await page.getByRole('button', { name: 'Grouped' }).click();
    await expect(page.locator('[data-slot="timeline"]')).toHaveCount(0);

    await page.locator('[data-adr-card]').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-adr-status]')).toBeVisible();
    const scrollArea = dialog.locator('[data-slot="scroll-area"]');
    await expect(scrollArea).toBeVisible();
    await expect(scrollArea.getByRole('heading').first()).toBeVisible();
    await expect(dialog.locator('[data-slot="scroll-area-scrollbar"]')).toBeAttached();
  });

  test('enlarges the ADR detail dialog for long reads and restores it', async ({ page }) => {
    await page.locator('[data-adr-card="0019"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const compact = await dialog.evaluate((el) => el.getBoundingClientRect().width);

    await dialog.getByRole('button', { name: 'Enlarge dialog' }).click();
    await expect(dialog.getByRole('button', { name: 'Restore size' })).toBeVisible();
    await expect
      .poll(() => dialog.evaluate((el) => el.getBoundingClientRect().width))
      .toBeGreaterThan(compact + 100);

    await dialog.getByRole('button', { name: 'Restore size' }).click();
    await expect(dialog.getByRole('button', { name: 'Enlarge dialog' })).toBeVisible();
    await expect
      .poll(() => dialog.evaluate((el) => el.getBoundingClientRect().width))
      .toBeLessThanOrEqual(compact + 1);
  });

  test('keeps the detail dialog body inside the card instead of scrolling sideways', async ({
    page,
  }) => {
    // ADR-0019 exists to carry the shapes that overflow this dialog: a code
    // block whose longest line beats the column, a bare URL with no break
    // opportunity, and a smart-link chip whose label outruns the measure.
    // Pinned by number rather than `.first()` so a new decision in the example
    // vault can't silently change what this asserts.
    await page.locator('[data-adr-card="0019"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const content = dialog.locator('[data-slot="scroll-area-content"]');
    // The primitive's inline `min-width: fit-content` is what lets the body be
    // laid out wider than the card, once anything in it has a min-content width
    // past the column — a `pre`'s longest line does not shrink for `overflow-x`.
    // The dialog renders no horizontal scrollbar, so that overflow is
    // unreachable; `wrapContent` overrides the inline style.
    await expect(content).toHaveCSS('min-width', '0px');

    const viewport = dialog.locator('[data-slot="scroll-area-viewport"]');
    const box = await viewport.evaluate((element) => {
      // A scrollable x-axis is draggable while selecting text even with no
      // scrollbar drawn, which reads as the dialog drifting sideways.
      element.scrollLeft = 9999;
      const drift = element.scrollLeft;
      element.scrollLeft = 0;
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        drift,
      };
    });
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
    expect(box.drift).toBe(0);
  });

  test('truncates an over-long smart-link chip and keeps the full label on hover', async ({
    page,
  }) => {
    await page.locator('[data-adr-card="0019"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const chip = dialog.locator('.tm-link').first();
    await expect(chip).toBeVisible();
    // The label is longer than the column, so the tail ellipsises rather than
    // pushing the chip through the card's padding — and the title carries the
    // whole label, since hovering is then the only way to read it.
    await expect(chip).toHaveAttribute('title', /postmortem and remediation plan/);

    const fit = await chip.evaluate((element) => {
      const tail = element.querySelector('.tm-tail') as HTMLElement;
      const card = element.closest('[role=dialog]')!.getBoundingClientRect();
      return {
        truncated: tail.scrollWidth > tail.clientWidth + 1,
        gapToCardEdge: Math.round(card.right - element.getBoundingClientRect().right),
      };
    });
    expect(fit.truncated).toBe(true);
    expect(fit.gapToCardEdge).toBeGreaterThan(8);
  });
});
