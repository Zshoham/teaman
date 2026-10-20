import { discoverDecks } from './discover-decks.mjs';
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
    entries: () => discoverDecks(base).map(deck => ({
      id: deck.id,
      data: { ...deck.data, title: deck.title, tags: deck.tags, slideCount: deck.slideCount },
      body: deck.text,
      sourcePath: deck.sourcePath,
    })),
  });
}
