import { join } from 'path';
import { createMarkdownProcessor, unified } from '@astrojs/markdown-remark';
import remarkWikiLink from 'remark-wiki-link';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { remarkStripLeadingH1 } from './remark-strip-h1.mjs';
import { remarkInlineSvg } from './remark-inline-svg.mjs';
import { remarkDiagramFences } from './remark-fence-svg.mjs';
import { remarkSmartLinks } from './remark-smart-links.mjs';
import { remarkWikiEmbeds, remarkWikiLinks } from './remark-wiki-links.mjs';
import { remarkReferenceBooks } from './remark-reference-books.mjs';
import { rehypeFlexibleCallouts } from './rehype-flexible-callouts.mjs';
import { rehypeCodeBlocks } from './rehype-code-blocks.mjs';
import { rehypeReferenceSections } from './rehype-reference-sections.mjs';
import { rehypeRawSvg } from './rehype-raw-svg.mjs';
import { collectionFor } from './collections.mjs';
import { assetRoots } from './vault-assets.mjs';

/**
 * The site's half of the Obsidian dialect: every remark and rehype pass vault
 * Markdown goes through, in order. `astro.config.mjs` hands it to Astro, and
 * the tests render through `createSiteMarkdownRenderer` — the same pipeline
 * Astro builds from it — so a dropped or reordered pass fails a test, not a
 * build. Everything it needs is an argument; it reads no environment.
 *
 * @typedef {object} SiteMarkdownOptions
 * @property {string} vaultDir
 * @property {string} base  normalized site base
 * @property {string} engineDir
 * @property {string} [publicDir]  the staged static dir
 * @property {Record<string, unknown>} [smartLinkHosts]  `config.smartLinks`
 * @property {string} [diagramCacheDir]  defaults to `<engine>/.diagram-cache`
 * @property {Record<string, Function>} [diagramCompilers]  per fence language,
 *   in place of the real compilers (tests)
 */

export const SHIKI_CONFIG = {
  themes: { light: 'github-light', dark: 'github-dark' },
};

/**
 * @param {SiteMarkdownOptions} options
 */
export function siteMarkdown({
  vaultDir,
  base,
  engineDir,
  publicDir,
  smartLinkHosts,
  diagramCacheDir = join(engineDir, '.diagram-cache'),
  diagramCompilers,
}) {
  return {
    gfm: true,
    smartypants: true,
    remarkPlugins: [
      remarkStripLeadingH1,
      // SUMMARY.md-backed references carry chapter boundary markers. This
      // pass gives each chapter a collision-free outline, rewrites its local
      // .md links into jumps within the assembled document, and records which
      // chapter file each part came from, for the wiki-link passes below.
      remarkReferenceBooks,
      // `![[image.png]]` → an image node, before anything that handles images.
      [remarkWikiEmbeds, { vaultDir, base }],
      // Where `![alt](diagram.svg)` is found after the note's own directory:
      // the vault root, then the public-asset roots for site-root-style
      // `/images/x.svg` references — as every renderer does.
      [remarkInlineSvg, { roots: assetRoots(vaultDir, { engineDir, publicDir }) }],
      // Diagram fences (diagram-kinds.mjs): mermaid/plantuml become <pre>s
      // the browser renders; tikz/typst/d2 compile to svg at build time,
      // cached in the engine dir (like .slides-build/.teaman-public —
      // gitignored, disposable) so unchanged diagrams never pay the
      // compiler again.
      [remarkDiagramFences, { cacheDir: diagramCacheDir, ...(diagramCompilers ? { compilers: diagramCompilers } : {}) }],
      // remark-wiki-link only parses `[[target|alias]]`; remarkWikiLinks
      // then resolves each link against the vault, Obsidian-style.
      [remarkWikiLink, { aliasDivider: '|' }],
      [remarkWikiLinks, { vaultDir, base }],
      // After the wiki-link passes so it sees every link node; in-site hrefs
      // never match a service host, so the two don't interact.
      [remarkSmartLinks, { hosts: smartLinkHosts }],
    ],
    rehypePlugins: [
      // A hand-written block `<svg>` gets the scroller svg images and diagram
      // fences already carry (remark-inline-svg, remark-fence-svg). First,
      // while it is still the block it was written as.
      rehypeRawSvg,
      rehypeFlexibleCallouts,
      // Astro's Shiki pass has already attached the normalized fence
      // language, so the static toolbar can label and copy exactly what was
      // highlighted. Diagram fences bypass Shiki and remain untouched.
      rehypeCodeBlocks,
      rehypeSlug,
      // The permalink spells the heading's Markdown marker (`##` on an h2), which
      // global.css hangs in the margin; Pagefind skips it so results don't
      // carry the hashes in their heading text.
      [rehypeAutolinkHeadings, {
        behavior: 'append',
        properties: {
          className: ['heading-anchor'],
          'aria-label': 'Permalink to this heading',
          dataPagefindIgnore: '',
        },
        content: heading => ({ type: 'text', value: '#'.repeat(Number(heading.tagName.slice(1))) }),
      }],
      // Last: heading ids and permalinks are already in place, so wrapping
      // chapters cannot disturb them. References only — see the plugin for
      // why containment is applied per chapter rather than per block.
      [rehypeReferenceSections, { referencesRoot: join(vaultDir, collectionFor('reference').dir) }],
    ],
  };
}

/**
 * Astro's `markdown` config for the site.
 *
 * @param {SiteMarkdownOptions} options
 */
export function siteMarkdownConfig(options) {
  return { shikiConfig: SHIKI_CONFIG, processor: unified(siteMarkdown(options)) };
}

/**
 * The renderer Astro builds from `siteMarkdownConfig`: `render(markdown,
 * { fileURL })` gives the HTML a page would show.
 *
 * @param {SiteMarkdownOptions} options
 */
export function createSiteMarkdownRenderer(options) {
  return createMarkdownProcessor({ shikiConfig: SHIKI_CONFIG, ...siteMarkdown(options) });
}
