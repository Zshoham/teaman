// Example teaman vault config — also the config for this repo's bundled
// `content/` vault. Pure data (no functions): the CLI serializes it and hands
// it to the engine. See ../README.md for the full SiteConfig shape and the
// available theme tokens (mirrors :root in site/src/styles/global.css).
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
};
