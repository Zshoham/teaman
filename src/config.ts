// Site identity, theme & landing-page copy.
//
// These are the bits a deployment is expected to customise — the rest of the
// landing page is content-driven (notes/, slides/, guides/) and shouldn't need
// edits.
//
// The home page no longer renders a hero — the feed starts directly at the
// filter bar, whose pills already carry per-type counts. The `hero` block
// below is kept for backwards compatibility (and still validated by `doctor`)
// but is unused; it is slated for removal in a future major. New vaults can
// omit it.
//
// In production the `teaman` CLI loads the vault's `teaman.config.js`, merges it
// over DEFAULT_CONFIG, and passes the result as JSON via `TEAMAN_CONFIG` (parsed
// below). When that env var is absent — `npm run dev` against the bundled vault,
// or the unit tests — DEFAULT_CONFIG is used directly. The config is pure data
// (no functions) so it round-trips through JSON and stays easy to validate.

/**
 * One tile in the home-page quick-links bento grid.
 *
 * - `label` — the link text (required).
 * - `url` — the destination (required). External (`https://…`) opens in a new
 *   tab; relative paths render as same-tab in-site links.
 * - `description` — optional one-line muted caption. A tile with a description
 *   gets more grid space than one without (see `src/lib/bento.ts`).
 * - `icon` — optional. A name from the engine's curated lucide-style set
 *   (`github`, `book`, `globe`, `link`, `file`, `code`, `rocket`, `lightbulb`,
 *   `rss`, `mail`, `coffee`, `arrow-up-right`) renders as a themed inline SVG.
 *   Any other string renders verbatim, so an emoji or short glyph works too.
 *   Defaults to `link`.
 *
 * Tile sizes are **not** configurable — the engine computes the bento layout
 * from each tile's content and the total link count (`src/lib/bento.ts`), and
 * the grid always fills exactly (no empty cells).
 */
export interface QuickLink {
  label: string;
  url: string;
  description?: string;
  icon?: string;
}

export interface SiteConfig {
  /** Short brand mark shown in the header (mono). Also used in the document title. */
  brand: string;
  /** Tagline shown after the brand. Also used in the document title (`brand — tagline`). */
  tagline: string;
  /**
   * Optional logo shown at the top-left of the header. Path is resolved against
   * the site `base`. Single-color SVGs work best — the image is rendered as a
   * CSS mask so it inherits the current text color (and therefore themes).
   * Set to `null` to fall back to the small accent square.
   */
  logo?: string | null;
  /**
   * @deprecated No longer rendered. The home page starts directly at the
   * filterable feed. Kept for backwards compatibility and still validated by
   * `doctor`; slated for removal in a future major. New vaults may omit it.
   */
  hero: {
    eyebrow: string;
    /** HTML allowed. Wrap muted-italic phrases in `<em>`; line breaks via `<br>`. */
    title: string;
    /** HTML allowed. */
    description: string;
  };
  /**
   * @deprecated No longer rendered. The footer is now centered on the page
   * stats alone. Kept for backwards compatibility and still validated by
   * `doctor`; slated for removal in a future major. New vaults may omit it.
   */
  footerNote?: string;
  /**
   * Quick-link tiles rendered as a bento grid above the home feed. Each entry
   * is a card pointing at an external (or internal) URL the vault author wants
   * to surface — a project repo, the tool the vault lives in, related reading,
   * etc. Pure data (JSON-serializable); `doctor` validates the shape. Absent
   * or empty → no grid is rendered (the default, so existing vaults are
   * unaffected).
   */
  links?: QuickLink[];
  /**
   * Semver range of the `teaman` engine this vault targets (e.g. `"^1.4"`).
   * Read only by the CLI, which warns when the running engine falls outside it.
   * Ignored by the site itself.
   */
  engine?: string;
  /**
   * Per-vault theme overrides: a map of CSS custom properties applied to
   * `:root` (see the token names in `src/styles/global.css`, e.g. `--primary`,
   * `--background`, `--radius`). This is the entire per-vault styling surface —
   * there are no per-vault component or CSS files — so engine upgrades never
   * require a merge. Unknown tokens are harmless (just unused).
   */
  theme?: Record<string, string>;
  /**
   * Project-wide styling for Slidev decks. Every deck is built with the engine's
   * `slidev-theme-teaman` (Source Serif 4 / Inter / JetBrains Mono, matching the
   * site) — these are the only knobs, applied to all decks without editing any
   * deck. All optional.
   */
  slides?: {
    /**
     * Logo shown on the footer strip of every slide. Path resolved like `logo`
     * (vault `public/`, then the vault root). Omit/`null` for no logo. Only
     * renders when `footer` is enabled.
     */
    logo?: string | null;
    /** Primary accent (headings rule, links, list markers). Any CSS color. */
    primary?: string;
    /** Secondary accent (blockquote rule + the footer strip). Any CSS color. */
    secondary?: string;
    /**
     * Show the footer strip (secondary-coloured band carrying the `logo`) on
     * every slide. Defaults to `true`; set `false` to hide it (and its logo).
     */
    footer?: boolean;
  };
}

export const DEFAULT_CONFIG: SiteConfig = {
  brand: 'vault.teaman',
  tagline: 'a working garden',
  logo: 'teacup.svg',

  hero: {
    eyebrow: 'an open notebook · est. 2026',
    title: 'Notes, guides and slides<br/><em>pulled, in public,</em> from a working vault.',
    description:
      "This is a thin window onto an Obsidian vault — the bits worth showing. " +
      "Some entries are evergreen, some are still growing, and a few are deliberately " +
      "wrong on purpose. Edits are silent.",
  },

  links: [
    {
      label: 'Obsidian',
      url: 'https://obsidian.md',
      description:
        'The local-first markdown app this vault lives in. Links are first-class, ' +
        'everything is a plain text file, and the graph is yours to shape.',
      icon: 'book',
    },
    {
      label: '@zshoham/teaman',
      url: 'https://www.npmjs.com/package/@zshoham/teaman',
      description: 'The engine that builds this site.',
      icon: 'rocket',
    },
    {
      label: 'Astro',
      url: 'https://astro.build',
      description: 'The web framework underneath.',
      icon: 'code',
    },
    {
      label: 'lucide',
      url: 'https://lucide.dev',
      icon: 'lightbulb',
    },
    {
      label: 'changelog',
      url: 'https://github.com/obsidianmd/obsidian-release/releases',
      icon: 'rss',
    },
    {
      label: 'docs',
      url: 'https://docs.obsidian.md',
      description: 'API & plugin reference.',
      icon: 'file',
    },
    {
      label: 'forum',
      url: 'https://forum.obsidian.md',
      icon: 'globe',
    },
    {
      label: 'made slowly',
      url: 'https://slowdown.xyz',
      icon: 'coffee',
    },
  ],
};

function loadConfig(): SiteConfig {
  const raw = process.env.TEAMAN_CONFIG;
  if (!raw) return DEFAULT_CONFIG;
  try {
    // The CLI may pass a partial config; fill gaps from DEFAULT_CONFIG. `hero`
    // is merged one level deep so a vault can override e.g. just the title.
    const parsed = JSON.parse(raw) as Partial<SiteConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      hero: { ...DEFAULT_CONFIG.hero, ...(parsed.hero ?? {}) },
    };
  } catch (error) {
    console.warn('[teaman] could not parse TEAMAN_CONFIG, using defaults:', error);
    return DEFAULT_CONFIG;
  }
}

export const SITE_CONFIG: SiteConfig = loadConfig();
