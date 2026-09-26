import { describe, expect, it } from 'vitest';
import {
  adrHref,
  adrNum,
  dailyHref,
  dailyIsoDate,
  entryHref,
  entryId,
  globEntryId,
  guideChapterHref,
  guideHref,
} from '../entry-identity.mjs';

describe('entryId', () => {
  it.each([
    ['foo.md', 'foo'],
    ['sub/foo.md', 'sub/foo'],
    ['Shipping Cadence.md', 'shipping-cadence'],
    ['C++ Tips.md', 'c-tips'],
    ['My Folder/My Deck.md', 'my-folder/my-deck'],
    ['guide/index.md', 'guide'],
    ['foo_bar.md', 'foo_bar'],
    ['win\\path\\Note.md', 'win/path/note'],
  ])('%s → %s', (path, id) => {
    expect(entryId('note', path)).toBe(id);
  });

  it('honours a frontmatter slug verbatim on page-per-file types', () => {
    expect(entryId('note', 'foo.md', { slug: 'Custom/Path' })).toBe('Custom/Path');
    expect(entryId('reference', 'foo.md', { slug: 'bar' })).toBe('bar');
    expect(entryId('slides', 'foo.md', { slug: 'bar' })).toBe('bar');
  });

  it('ignores a frontmatter slug where the path carries meaning', () => {
    expect(entryId('guide', 'g/intro.md', { slug: 'x' })).toBe('g/intro');
    expect(entryId('daily', '2026-01-02.md', { slug: 'x' })).toBe('2026-01-02');
    expect(entryId('decision', 'adr-0001.md', { slug: 'x' })).toBe('adr-0001');
  });

  it('adapts to the Astro glob generateId signature', () => {
    expect(globEntryId('note')({ entry: 'Sub/Foo Bar.md', data: {} })).toBe('sub/foo-bar');
  });
});

describe('entryHref', () => {
  it('composes base, route and id', () => {
    expect(entryHref('/', 'note', 'sub/foo')).toBe('/notes/sub/foo/');
    expect(entryHref('/site/', 'slides', 'deck')).toBe('/site/slides/deck/');
    expect(entryHref('/', 'reference', 'rust')).toBe('/references/rust/');
  });
});

describe('daily identity', () => {
  it('files a daily by its YYYY-MM-DD id, else its UTC frontmatter date', () => {
    expect(dailyIsoDate('2026-03-12', new Date('2020-01-01T00:00:00Z'))).toBe('2026-03-12');
    expect(dailyIsoDate('notes/monday', new Date('2026-03-12T00:00:00Z'))).toBe('2026-03-12');
  });

  it('links a day to its section on the Sunday-anchored week page', () => {
    // 2026-03-12 is a Thursday; its week starts Sunday 2026-03-08.
    expect(dailyHref('/', '2026-03-12')).toBe('/daily/2026-03-08/#day-2026-03-12');
    expect(dailyHref('/site/', '2026-03-08')).toBe('/site/daily/2026-03-08/#day-2026-03-08');
  });
});

describe('guide identity', () => {
  it('serves the first chapter at the guide root', () => {
    const chapters = ['intro', 'setup'];
    expect(guideHref('/', 'g')).toBe('/guides/g/');
    expect(guideChapterHref('/', 'g', chapters, 'intro')).toBe('/guides/g/');
    expect(guideChapterHref('/', 'g', chapters, 'setup')).toBe('/guides/g/setup/');
  });
});

describe('decision identity', () => {
  it('addresses an ADR by the number in its id', () => {
    expect(adrNum('adr-0007')).toBe('0007');
    expect(adrNum('nested/adr-0012-title')).toBe('0012');
    expect(adrHref('/', '0007')).toBe('/decisions/?adr=0007');
  });
});
