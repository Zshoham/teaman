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

/** Every publishable Slidev deck under `slidesRoot`, parsed once. */
export function discoverDecks(slidesRoot: string): DiscoveredDeck[];
