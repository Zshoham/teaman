import { discoverDecks } from './discover-decks.mjs';
import { isPublished } from './publication.mjs';
import { vaultLoader } from './vault-loader.mjs';

/**
 * Astro content loader over deck discovery, so the deck cards list exactly
 * the decks the build produces. Drafts are stored like any glob collection's;
 * `getPublished` keeps them off the site. Decks are built by Slidev, not
 * rendered here; an entry's body is its slides' visible text.
 */
export function slidesLoader({ base }) {
  return vaultLoader({
    name: 'teaman-slides-loader',
    base,
    entries: () => {
      const decks = discoverDecks(base);
      // As a glob collection fails on a file whose frontmatter does not parse.
      const unreadable = decks.find(deck => deck.error);
      if (unreadable) throw new Error(`slides/${unreadable.relPath}: ${unreadable.error}`);
      // The store keeps one entry per id, so a draft sharing a published
      // deck's id (`slug:`) would replace it, and `getPublished` would then
      // drop both.
      const publishedIds = new Set(decks.filter(deck => isPublished(deck)).map(deck => deck.id));
      return decks
        .filter(deck => isPublished(deck) || !publishedIds.has(deck.id))
        .map(deck => ({
          id: deck.id,
          data: { ...deck.data, title: deck.title, tags: deck.tags, slideCount: deck.slideCount },
          body: deck.text,
          sourcePath: deck.sourcePath,
        }));
    },
  });
}
