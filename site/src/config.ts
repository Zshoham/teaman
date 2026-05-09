// Site identity & landing-page copy.
//
// These are the bits a deployment is expected to customise — the rest of the
// landing page is content-driven (notes/, slides/, guides/) and shouldn't need
// edits. The hero `title` and `description` accept inline HTML; use `<em>` for
// the muted-italic emphasis treatment and `<br>` for line breaks.

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
}

export const SITE_CONFIG: SiteConfig = {
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
