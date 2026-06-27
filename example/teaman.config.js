// Example teaman vault config — the config for this repo's bundled `example/`
// vault. Pure data (no functions): the CLI serializes it and hands it to the
// engine. See ../README.md for the full SiteConfig shape and the available
// theme tokens (mirrors :root in ../src/styles/global.css).
export default {
  // Semver range of the engine this vault targets. `teaman` warns when the
  // running engine version falls outside it. Pin tightly (e.g. '~1.0.2') for
  // byte-stable rebuilds under the npx model.
  engine: '^1.0',

  brand: 'vault.teaman',
  tagline: 'a working garden',
  logo: 'teacup.svg', // resolved from this vault, then vault/public, then engine defaults

  hero: {
    eyebrow: 'an open notebook · est. 2026',
    title: 'Notes, guides and slides<br/><em>pulled, in public,</em> from a working vault.',
    description:
      'This is a thin window onto an Obsidian vault — the bits worth showing. ' +
      'Some entries are evergreen, some are still growing, and a few are deliberately ' +
      'wrong on purpose. Edits are silent.',
  },

  footerNote: 'made slowly',

  // Per-vault theming is the entire customization surface — override CSS tokens
  // here rather than editing engine source, so upgrades never need a merge.
  // theme: {
  //   '--primary': 'oklch(0.67 0.14 48)',
  //   '--radius': '0.5rem',
  // },

  // Project-wide Slidev styling. Every deck is built with the teaman theme
  // (Source Serif 4 / Inter / JetBrains Mono, matching the site); these are the
  // only knobs and apply to all decks without editing any deck.
  slides: {
    logo: 'teacup.svg',
    primary: 'oklch(0.8314 0.1671 85.79)',
    secondary: 'oklch(0.4253 0.1094 248.83)',
  },
};
