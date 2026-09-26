export interface DiscoveredDeck {
  /** The site's name for the deck: its URL segment and build directory. */
  id: string;
  path: string;
  relativePath: string;
  markdown: string;
  data: Record<string, unknown>;
  title: string;
  tags: string[];
  slideCount: number;
  /** Every slide's visible content, for excerpts and search. */
  text: string;
}

/**
 * Whether a deck id / relative path is publishable: false when any path segment
 * starts with `_`. Accepts `/`-separated ids as well as platform-separated paths.
 */
export function isPublishableDeckId(id: string): boolean;

/** Every publishable Slidev deck under `slidesRoot`, parsed once. */
export function discoverDecks(slidesRoot: string): DiscoveredDeck[];
