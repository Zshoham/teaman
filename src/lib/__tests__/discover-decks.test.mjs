import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverDecks, isPublishableDeckId } from '../discover-decks.mjs';

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
});

describe('isPublishableDeckId', () => {
  it('publishes ids with no underscore-prefixed segment', () => {
    expect(isPublishableDeckId('live')).toBe(true);
    expect(isPublishableDeckId('foo/bar')).toBe(true);
    expect(isPublishableDeckId('foo_bar/baz')).toBe(true);
  });

  it('rejects a trailing underscore-prefixed segment', () => {
    expect(isPublishableDeckId('foo/_wip')).toBe(false);
    expect(isPublishableDeckId('_hidden')).toBe(false);
  });

  it('rejects an underscore-prefixed parent segment', () => {
    expect(isPublishableDeckId('_foo/bar')).toBe(false);
  });

  it('handles platform-separated relative paths too', () => {
    expect(isPublishableDeckId('foo\\_wip')).toBe(false);
    expect(isPublishableDeckId('foo\\bar')).toBe(true);
  });
});
