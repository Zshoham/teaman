export interface DiscoveredDeck {
  /** The site's name for the deck: its URL segment and build directory. */
  id: string;
  sourcePath: string;
  /** Under `slidesRoot`, `/`-separated. */
  relPath: string;
  markdown: string;
  data: Record<string, unknown>;
  title: string;
  tags: string[];
  slideCount: number;
  /** Every slide's visible content, for excerpts and search. */
  text: string;
}

/** Every Slidev deck under `slidesRoot` (drafts included), parsed once. */
export function discoverDecks(slidesRoot: string): DiscoveredDeck[];
