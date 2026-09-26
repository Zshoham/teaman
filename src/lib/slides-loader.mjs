import { discoverDecks } from './discover-decks.mjs';
import { vaultLoader } from './vault-loader.mjs';

/**
 * Astro content loader over the deck catalog, so the deck cards list exactly
 * the decks the build produces. Decks are built by Slidev, not rendered here;
 * an entry's body is its slides' visible text.
 */
export function slidesLoader({ base }) {
  return vaultLoader({
    name: 'teaman-slides-loader',
    base,
    entries: () => discoverDecks(base).map(deck => ({
      id: deck.id,
      data: { ...deck.data, title: deck.title, tags: deck.tags, slideCount: deck.slideCount },
      body: deck.text,
      sourcePath: deck.path,
    })),
  });
}
