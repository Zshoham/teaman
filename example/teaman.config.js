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

  // Quick-link tiles rendered as a bento grid above the home feed. Each tile
  // is pure data: label, url, optional description / icon. Tile sizes are not
  // configurable — the engine sizes them from the content (description length,
  // label length) and the total link count, and the grid always fills exactly
  // (every row sums to the grid width, no empty cells). `icon` maps to a
  // curated lucide-style set (github, book, globe, link, code, rss, mail,
  // rocket, lightbulb, coffee, file, arrow-up-right); any other string renders
  // verbatim (emoji ok). Absent/empty → no grid.
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
    { label: 'lucide', url: 'https://lucide.dev', icon: 'lightbulb' },
    { label: 'changelog', url: 'https://github.com/obsidianmd/obsidian-release/releases', icon: 'rss' },
    { label: 'docs', url: 'https://docs.obsidian.md', description: 'API & plugin reference.', icon: 'file' },
    { label: 'forum', url: 'https://forum.obsidian.md', icon: 'globe' },
    { label: 'made slowly', url: 'https://slowdown.xyz', icon: 'coffee' },
  ],

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
