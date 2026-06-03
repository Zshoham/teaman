// Site identity, theme & landing-page copy.
//
// These are the bits a deployment is expected to customise — the rest of the
// landing page is content-driven (notes/, slides/, guides/) and shouldn't need
// edits. The hero `title` and `description` accept inline HTML; use `<em>` for
// the muted-italic emphasis treatment and `<br>` for line breaks.
//
// In production the `teaman` CLI loads the vault's `teaman.config.js`, merges it
// over DEFAULT_CONFIG, and passes the result as JSON via `TEAMAN_CONFIG` (parsed
// below). When that env var is absent — `npm run dev` against the bundled vault,
// or the unit tests — DEFAULT_CONFIG is used directly. The config is pure data
// (no functions) so it round-trips through JSON and stays easy to validate.

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
  hero: {
    eyebrow: string;
    /** HTML allowed. Wrap muted-italic phrases in `<em>`; line breaks via `<br>`. */
    title: string;
    /** HTML allowed. */
    description: string;
  };
  /** Optional right-aligned footer note. HTML allowed. */
  footerNote?: string;
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

  footerNote: 'made slowly',
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
