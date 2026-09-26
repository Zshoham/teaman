import { describe, expect, it } from 'vitest';
import { entryHref, entryId, globEntryId } from '../entry-identity.mjs';

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
