import { fileURLToPath } from 'url';
import { join, resolve as resolvePath } from 'path';
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import remarkWikiLink from 'remark-wiki-link';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { remarkStripLeadingH1 } from './src/lib/remark-strip-h1.mjs';
import { remarkMermaid } from './src/lib/remark-mermaid.mjs';
import { remarkPlantuml } from './src/lib/remark-plantuml.mjs';
import { remarkInlineSvg } from './src/lib/remark-inline-svg.mjs';
import { remarkFenceSvg } from './src/lib/remark-fence-svg.mjs';
import { remarkSmartLinks } from './src/lib/remark-smart-links.mjs';
import { remarkReferenceBooks } from './src/lib/remark-reference-books.mjs';
import { rehypeFlexibleCallouts } from './src/lib/rehype-flexible-callouts.mjs';
import { rehypeReferenceSections } from './src/lib/rehype-reference-sections.mjs';
import { excalidrawAssets } from './src/lib/excalidraw-assets.mjs';
import { normalizeBase } from './src/lib/site-base.mjs';

import react from '@astrojs/react';

// Normalize the same way the build scripts do (single leading + trailing slash)
// so `import.meta.env.BASE_URL` and the wiki-link hrefTemplate below never
// concatenate into broken URLs like `/fooguides/...` for `--base /foo`.
const base = normalizeBase(process.env.TEAMAN_BASE ?? process.env.SITE_BASE);

// Where remark-inline-svg finds the files behind `![alt](diagram.svg)`.
// Obsidian keeps attachments anywhere in the vault, so the whole vault root is
// searched (the plugin also tries the note's own directory for relative URLs),
// plus the public-asset roots for site-root-style `/images/x.svg` references —
// same env-seam fallbacks as content-paths.ts: bundled example/ + resources/
// when the CLI didn't set TEAMAN_VAULT / TEAMAN_PUBLIC.
const vaultRoot = process.env.TEAMAN_VAULT
  ? resolvePath(process.env.TEAMAN_VAULT)
  : fileURLToPath(new URL('./example', import.meta.url));
const svgRoots = [
  vaultRoot,
  process.env.TEAMAN_PUBLIC,
  join(vaultRoot, 'public'),
  fileURLToPath(new URL('./resources', import.meta.url)),
].filter(Boolean);

// Smart-link host overrides (`config.smartLinks`) for self-hosted GitLab / Jira
// Data Center. The markdown pipeline runs inside this config, which can't import
// the TS `src/config.ts`, so read the same TEAMAN_CONFIG env var it reads —
// absent (plain `npm run dev`, the tests) just means the built-in hosts.
const smartLinkHosts = (() => {
  try {
    return JSON.parse(process.env.TEAMAN_CONFIG ?? '{}').smartLinks ?? undefined;
  } catch {
    return undefined;
  }
})();

export default defineConfig({
  base,
  outDir: process.env.TEAMAN_OUT ?? './public',
  publicDir: process.env.TEAMAN_PUBLIC ?? './resources',
  integrations: [mdx(), react(), excalidrawAssets({ base })],
  vite: {
    plugins: [tailwindcss()],
    server: {
      fs: { allow: ['..'] },
    },
  },
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
    processor: unified({
      gfm: true,
      smartypants: true,
      remarkPlugins: [
        remarkStripLeadingH1,
        // SUMMARY.md-backed references carry chapter boundary markers. This
        // pass gives each chapter a collision-free outline and rewrites its
        // local .md links into jumps within the assembled document.
        remarkReferenceBooks,
        remarkMermaid,
        remarkPlantuml,
        [remarkInlineSvg, { roots: svgRoots }],
        // tikz/typst fences compile to svg at build time; renders are cached
        // in the engine dir (like .slides-build/.teaman-public — gitignored,
        // disposable) so unchanged diagrams never pay the compiler again.
        [remarkFenceSvg, { cacheDir: fileURLToPath(new URL('./.diagram-cache', import.meta.url)) }],
        [remarkWikiLink, {
          pageResolver: (name) => [name.replace(/ /g, '-').toLowerCase()],
          hrefTemplate: (permalink) => `${base}notes/${permalink}/`,
          aliasDivider: '|',
        }],
        // After wiki-link so it sees every link node; in-site hrefs never match
        // a service host, so the two don't interact.
        [remarkSmartLinks, { hosts: smartLinkHosts }],
      ],
      rehypePlugins: [
        rehypeFlexibleCallouts,
        rehypeSlug,
        [rehypeAutolinkHeadings, {
          behavior: 'append',
          properties: { className: ['heading-anchor'], 'aria-label': 'Permalink to this heading' },
          content: { type: 'text', value: '#' },
        }],
        // Last: heading ids and permalinks are already in place, so wrapping
        // chapters cannot disturb them. References only — see the plugin for
        // why containment is applied per chapter rather than per block.
        [rehypeReferenceSections, { referencesRoot: join(vaultRoot, 'references') }],
      ],
    }),
  },
});
