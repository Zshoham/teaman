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

test.describe('reference page', () => {
  const REFERENCE = '/references/teaman-system/';
  const LONG_REFERENCE = '/references/rust-reference/';

  test('renders a long-form title and heading table of contents', async ({ page }) => {
    await page.goto(REFERENCE);
    await expect(page.locator('h1.reference-title')).toHaveText('teaman system reference');
    const rail = page.locator('aside');
    await expect(rail.getByRole('navigation', { name: 'Table of contents' })).toBeVisible();
    await expect(rail.getByRole('link', { name: 'Environment seam', exact: true })).toBeVisible();
  });

  test('document search reports only sections containing the phrase', async ({ page }) => {
    await page.goto(REFERENCE);
    const rail = page.locator('aside');
    const search = rail.getByLabel('Search sections in this document');

    await search.fill('durable reference');
    await expect(rail.getByText('1 section', { exact: true })).toBeVisible();
    await expect(rail.getByRole('link', { name: /Introduction/ }))
      .toHaveAttribute('href', '#reference-content');

    await search.fill('exactly one leading');
    await expect(rail.getByText('1 section', { exact: true })).toBeVisible();
    await expect(rail.getByRole('link', { name: /Base paths/ })).toBeVisible();
  });

  test('offers the generated Typst PDF as a download', async ({ page }) => {
    await page.goto(REFERENCE);
    const link = page.locator('aside').getByRole('link', { name: 'Download PDF' });
    await expect(link).toHaveAttribute('href', '/references/teaman-system/reference.pdf');
    const response = await page.request.get(await link.getAttribute('href') ?? '');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
  });

  test('keeps a long table of contents scrollable and follows the active section', async ({ page }) => {
    await page.goto(LONG_REFERENCE);
    const rail = page.locator('aside');
    const scrollArea = rail.locator('[data-reference-toc-scroll]');
    const viewport = scrollArea.locator('[data-slot="scroll-area-viewport"]');

    const dimensions = await viewport.evaluate(element => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(dimensions.clientHeight).toBeGreaterThan(0);
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

    await rail.getByRole('button', {
      name: 'Collapse all table of contents sections',
    }).click();
    await expect(rail.getByRole('link', { name: 'Input format', exact: true })).toBeHidden();

    await page.locator('#glossary').evaluate(element => element.scrollIntoView());
    await expect.poll(async () => (
      rail.locator('a[aria-current="location"]').getAttribute('href')
    )).toBe('#glossary');
    await expect(rail.getByRole('link', {
      name: 'Abstract syntax tree',
      exact: true,
    })).toBeHidden();

    await expect.poll(async () => viewport.evaluate((element) => {
      const active = element.querySelector('a[aria-current="location"]');
      if (!active) return false;
      const viewportRect = element.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      return activeRect.top >= viewportRect.top && activeRect.bottom <= viewportRect.bottom;
    })).toBe(true);
  });

  test('fills the available viewport and collapses nested section groups', async ({ page }) => {
    await page.goto(LONG_REFERENCE);

    const rail = page.locator('aside');
    const bottomGap = () => rail.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return Math.abs(window.innerHeight - 24 - rect.bottom);
    });
    await expect.poll(bottomGap).toBeLessThan(2);
    await page.evaluate(() => window.scrollTo(0, 320));
    await expect.poll(bottomGap).toBeLessThan(2);

    const child = rail.getByRole('link', { name: 'Input format', exact: true });
    await rail.getByRole('button', {
      name: 'Collapse all table of contents sections',
    }).click();
    await expect(child).toBeHidden();
    await expect(rail.getByRole('button', {
      name: 'Expand all table of contents sections',
    })).toBeVisible();
    await rail.getByRole('button', {
      name: 'Expand all table of contents sections',
    }).click();
    await expect(child).toBeVisible();

    const trigger = rail.getByRole('button', {
      name: 'Collapse subsections of Lexical structure',
    });
    await expect(child).toBeVisible();
    await trigger.click();
    await expect(child).toBeHidden();
    await expect(rail.getByRole('link', { name: 'Lexical structure', exact: true })).toBeVisible();
    await rail.getByRole('button', {
      name: 'Expand subsections of Lexical structure',
    }).click();
    await expect(child).toBeVisible();
  });

  // Regression: base-ui's ScrollArea.Content carries an inline
  // `min-width: fit-content`, so the deeply indented entries of a book-sized
  // TOC made the rail scroll sideways — carrying every collapse trigger past
  // its right-hand edge, with no horizontal scrollbar to bring it back. The
  // triggers were in the DOM and "visible" to computed style, but unreachable
  // until the reader collapsed everything and the list narrowed again.
  test('keeps the collapse triggers inside the rail, not off its right edge', async ({ page }) => {
    await page.goto(LONG_REFERENCE);
    const rail = page.locator('aside');
    const trigger = rail.getByRole('button', { name: /^Collapse subsections of / }).first();
    await expect(trigger).toBeVisible();

    const viewport = rail
      .locator('[data-reference-toc-scroll] [data-slot="scroll-area-viewport"]')
      .first();
    const edges = await viewport.evaluate(element => ({
      right: element.getBoundingClientRect().right,
      overflowsHorizontally: element.scrollWidth > element.clientWidth,
    }));
    const box = await trigger.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(edges.right);

    // And it actually responds to a real click at its own coordinates.
    await trigger.click();
    await expect(
      rail.getByRole('button', { name: /^Expand subsections of / }).first(),
    ).toBeVisible();
  });

  test('lets the reader collapse the branch they are currently reading', async ({ page }) => {
    await page.goto(LONG_REFERENCE);
    const rail = page.locator('aside');
    const child = rail.getByRole('link', { name: 'Input format', exact: true });
    const target = await child.getAttribute('href');

    // Navigate the way a reader does — click the entry — rather than calling
    // scrollIntoView() on the heading. Chapters carry `content-visibility`, so
    // their real heights only exist once laid out: a raw scrollIntoView lands
    // hundreds of pixels short when the chapters below it reflow afterwards,
    // and the section being read is then legitimately an earlier one. Fragment
    // navigation is re-resolved after that layout, so it lands where the
    // heading's scroll-margin says it should.
    await child.click();
    await expect.poll(async () => (
      rail.locator('a[aria-current="location"]').getAttribute('href')
    )).toBe(target);

    // Reading inside a group must not pin it open — the trigger stays live.
    await rail.getByRole('button', {
      name: 'Collapse subsections of Lexical structure',
    }).click();
    await expect(child).toBeHidden();
  });

  test('assembles real mdBook chapters into one page with working cross-chapter and rule links', async ({ page }) => {
    await page.goto(LONG_REFERENCE);
    await expect(page.locator('h1.reference-title')).toHaveText('The Rust Reference');
    await expect(page.locator('#introduction')).toBeVisible();
    await expect(page.locator('[id="r-example.rule.label"]')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'expressions chapter' }).first()).toHaveAttribute('href', '#expressions');
  });

  test('contains chapters without disturbing deep links into the document', async ({ page }) => {
    await page.goto(LONG_REFERENCE);
    // Chapters are the unit `content-visibility` is applied to, so the browser
    // can skip the parts of a book-sized reference nobody is reading.
    const chapters = page.locator('#reference-content > section.reference-chapter');
    expect(await chapters.count()).toBeGreaterThan(5);
    for (const style of await chapters.evaluateAll(nodes => nodes.map(n => n.getAttribute('style')))) {
      expect(style).toMatch(/contain-intrinsic-size: auto \d+px/);
    }

    // Skipped chapters are laid out from an estimate, so a jump deep into the
    // document must still land on its target and stay there as the chapters
    // above it render and report their real heights.
    for (const id of ['expressions', 'glossary']) {
      await page.goto(`${LONG_REFERENCE}#${id}`);
      const offset = () => page.locator(`#${id}`).evaluate(el => Math.round(el.getBoundingClientRect().top));
      await expect.poll(offset).toBeLessThan(200);
      const landed = await offset();
      await page.waitForTimeout(1500);
      expect(Math.abs(await offset() - landed)).toBeLessThan(4);
    }

    // The document height must be honest up front, or the scrollbar visibly
    // stretches while reading.
    const atLoad = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 900) {
        window.scrollTo(0, y);
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    });
    const settled = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(Math.abs(settled - atLoad) / settled).toBeLessThan(0.15);
  });

  test('keeps a stable rail when reversing from the end of the document', async ({ page }) => {
    await page.goto(LONG_REFERENCE);
    const rail = page.locator('aside');

    const scrollTo = async (offsetFromEnd: number) => {
      await page.evaluate((offset) => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, Math.max(0, max - offset));
      }, offsetFromEnd);
      await page.waitForTimeout(150);
      return rail.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: rect.height };
      });
    };

    const beforeEnd = await scrollTo(900);
    const atEnd = await scrollTo(0);
    const afterReversing = await scrollTo(900);

    expect(atEnd.height).toBeLessThanOrEqual(beforeEnd.height);
    expect(Math.abs(atEnd.top - beforeEnd.top)).toBeLessThan(2);
    expect(Math.abs(afterReversing.height - beforeEnd.height)).toBeLessThan(2);
    expect(Math.abs(afterReversing.top - beforeEnd.top)).toBeLessThan(2);
    expect(atEnd.bottom).toBeGreaterThan(0);
    expect(atEnd.top).toBeLessThan(page.viewportSize()!.height);
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

  test('ellipsises a bare ref that is wider than the content column', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(NOTE);
    const chip = page
      .locator('.tm-link.tm-bare[data-tm-kind="issue"][data-tm-service="gitlab"]')
      .first();
    const ref = chip.locator('.tm-ref');
    await ref.evaluate((element) => {
      element.textContent = `${'deeply-nested-project/'.repeat(20)}api#77`;
    });

    const fit = await chip.evaluate((element) => {
      const ref = element.querySelector('.tm-ref') as HTMLElement;
      const column = element.closest('.prose') as HTMLElement;
      return {
        refIsTruncated: ref.scrollWidth > ref.clientWidth + 1,
        chipFitsColumn: element.getBoundingClientRect().right <=
          column.getBoundingClientRect().right + 1,
      };
    });
    expect(fit.refIsTruncated).toBe(true);
    expect(fit.chipFitsColumn).toBe(true);
    await expect(ref).toHaveCSS('text-overflow', 'ellipsis');
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
    // The label leads, because it is the part the chip truncates when it runs
    // out of column; the ref and host follow it.
    await expect(chip).toHaveAttribute(
      'title',
      'Trial a one-week loop · PLAT-412 · acme.atlassian.net',
    );
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
