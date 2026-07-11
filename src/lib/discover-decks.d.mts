export interface DiscoveredDeck {
  id: string;
  path: string;
  relativePath: string;
  markdown: string;
  data: Record<string, unknown>;
}

/**
 * Whether a deck id / relative path is publishable: false when any path segment
 * starts with `_`. Accepts `/`-separated ids as well as platform-separated paths.
 */
export function isPublishableDeckId(id: string): boolean;

/** Discover publishable Slidev decks using the same policy for build and search. */
export function discoverDecks(slidesRoot: string): DiscoveredDeck[];
