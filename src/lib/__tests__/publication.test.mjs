import { describe, expect, it } from 'vitest';
import { isPublished, isPublishedPath } from '../publication.mjs';

describe('isPublished', () => {
  it('keeps drafts off the site', () => {
    expect(isPublished({ data: { draft: true }, relPath: 'a.md' })).toBe(false);
    expect(isPublished({ data: { draft: false }, relPath: 'a.md' })).toBe(true);
    expect(isPublished({ data: null, relPath: 'a.md' })).toBe(true);
  });

  it('keeps any _-prefixed path segment off the site', () => {
    expect(isPublishedPath('_templates/daily.md')).toBe(false);
    expect(isPublishedPath('sub/_wip.md')).toBe(false);
    expect(isPublishedPath('sub\\_wip.md')).toBe(false);
    expect(isPublishedPath('foo_bar/baz.md')).toBe(true);
    expect(isPublished({ data: {}, relPath: '_scratch/a.md' })).toBe(false);
  });
});
