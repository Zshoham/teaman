export interface DiscoveredDeck {
  /** The site's name for the deck: its URL segment and build directory. */
  id: string;
  sourcePath: string;
  /** Under `slidesRoot`, `/`-separated. */
  relPath: string;
  markdown: string;
  /** Headmatter as the slides collection's schema reads it. */
  data: Record<string, unknown>;
  /** What that schema rejects in it. */
  issues: string[];
  title: string;
  tags: string[];
  slideCount: number;
  /** Every slide's visible content, for excerpts and search. */
  text: string;
  /** Why its headmatter cannot be read; `data` is then empty. */
  error?: string;
}

/** Every Slidev deck under `slidesRoot` (drafts included), parsed once. */
export function discoverDecks(slidesRoot: string): DiscoveredDeck[];
