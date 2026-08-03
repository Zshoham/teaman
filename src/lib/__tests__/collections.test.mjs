import { describe, it, expect } from 'vitest';
import { COLLECTIONS, CONTENT_DIRS, collectionFor, pagefindGlob } from '../collections.mjs';

describe('COLLECTIONS', () => {
  it('covers every content type the engine ships', () => {
    expect(COLLECTIONS.map(c => c.type)).toEqual([
      'note', 'reference', 'daily', 'guide', 'slides', 'decision',
    ]);
  });

  it('gives every type a unique dir, route and type', () => {
    for (const key of ['type', 'dir', 'route']) {
      const values = COLLECTIONS.map(c => c[key]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('only omits an empty message for types with no index page', () => {
    for (const collection of COLLECTIONS) {
      expect(collection.index).toBe(collection.emptyMessage !== null);
    }
  });

  // dailies/ is the one type whose vault directory and URL segment differ.
  it('serves dailies/ at /daily/', () => {
    expect(collectionFor('daily')).toMatchObject({ dir: 'dailies', route: 'daily' });
  });

  it('counts slides as decks while still naming the type "slides"', () => {
    expect(collectionFor('slides')).toMatchObject({
      label: 'slides',
      plural: 'slides',
      unit: 'deck',
      units: 'decks',
    });
  });

  it('throws on an unknown type rather than returning undefined', () => {
    expect(() => collectionFor('nope')).toThrow(/unknown collection type: nope/);
  });
});

describe('CONTENT_DIRS', () => {
  it('lists the vault directories the CLI scaffolds and checks', () => {
    expect(CONTENT_DIRS).toEqual([
      'notes', 'references', 'dailies', 'guides', 'slides', 'decisions',
    ]);
  });
});

describe('pagefindGlob', () => {
  it('crawls the home page, the deck index, and every fully-rendered section', () => {
    expect(pagefindGlob()).toBe(
      '{index.html,slides/index.html,{daily,guides,notes,references}/**/*.html}',
    );
  });

  it('leaves out types whose content is not in the crawled HTML', () => {
    const glob = pagefindGlob();
    // The trailing `{...}/**/*.html` group is what gets crawled recursively.
    const recursive = glob.match(/\{([^{}]*)\}\/\*\*\/\*\.html/)?.[1].split(',');

    // Slidev decks are JS-rendered and ADR bodies only exist once a modal
    // opens; both are fed in as custom records instead, so neither type may
    // appear as a recursively-crawled section.
    expect(recursive).not.toContain('slides');
    expect(recursive).not.toContain('decisions');
    expect(glob).not.toMatch(/decisions/);
  });
});
