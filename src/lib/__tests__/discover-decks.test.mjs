import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverDecks } from '../discover-decks.mjs';

let root;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe('discoverDecks', () => {
  it('recursively returns only publishable decks in deterministic order', () => {
    root = mkdtempSync(join(tmpdir(), 'teaman-decks-'));
    mkdirSync(join(root, 'nested'), { recursive: true });
    mkdirSync(join(root, '_private'), { recursive: true });
    writeFileSync(join(root, 'live.md'), '---\ntitle: Live\n---\n# Live');
    writeFileSync(join(root, 'draft.md'), '---\ndraft: true\n---\n# Draft');
    writeFileSync(join(root, '_hidden.md'), '# Hidden');
    writeFileSync(join(root, '_private', 'hidden.md'), '# Hidden');
    writeFileSync(join(root, 'nested', 'deck.md'), '# Nested');

    expect(discoverDecks(root).map(deck => deck.id)).toEqual(['live', 'nested/deck']);
  });

  it('names decks with the site entry id, not the raw path', () => {
    root = mkdtempSync(join(tmpdir(), 'teaman-decks-'));
    mkdirSync(join(root, 'Team Talks'), { recursive: true });
    writeFileSync(join(root, 'Team Talks', 'My Deck.md'), '# Deck');
    writeFileSync(join(root, 'renamed.md'), '---\nslug: custom\n---\n# Renamed');

    const decks = discoverDecks(root);
    expect(decks.map(deck => deck.id)).toEqual(['custom', 'team-talks/my-deck']);
    expect(decks[1].relativePath).toBe(join('Team Talks', 'My Deck.md'));
  });
});

describe('deck catalog fields', () => {
  it('parses each deck with Slidev: title, tags, slide count, and visible text', () => {
    root = mkdtempSync(join(tmpdir(), 'teaman-decks-'));
    writeFileSync(join(root, 'talk.md'), [
      '---', 'title: The Talk', 'tags: a, b', '---',
      '# One', '', 'hello', '', '<!-- presenter only -->', '',
      '---', 'layout: center', '---', '', '# Two', '',
    ].join('\n'));
    writeFileSync(join(root, 'untitled-deck.md'), '# Only\n');

    const [talk, untitled] = discoverDecks(root);
    expect(talk).toMatchObject({ title: 'The Talk', tags: ['a', 'b'], slideCount: 2 });
    expect(talk.text).toBe('# One\n\nhello\n\n# Two');
    expect(untitled).toMatchObject({ title: 'untitled deck', tags: [], slideCount: 1 });
  });

  it('yields nothing for a vault without slides', () => {
    expect(discoverDecks(join(tmpdir(), 'teaman-no-such-slides'))).toEqual([]);
  });
});
