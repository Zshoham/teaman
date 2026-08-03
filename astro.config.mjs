import { join } from 'path';
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
import {
  engineDir,
  outDir,
  publicDir,
  siteBase as base,
  teamanConfig,
  vaultDir,
} from './src/lib/build-env.mjs';

import react from '@astrojs/react';

// Where remark-inline-svg finds the files behind `![alt](diagram.svg)`.
// Obsidian keeps attachments anywhere in the vault, so the whole vault root is
// searched (the plugin also tries the note's own directory for relative URLs),
// plus the public-asset roots for site-root-style `/images/x.svg` references.
// De-duplicated because `publicDir` already *is* engine resources/ when the CLI
// didn't stage one.
const svgRoots = [...new Set([
  vaultDir,
  publicDir,
  join(vaultDir, 'public'),
  join(engineDir, 'resources'),
])];

// Smart-link host overrides (`config.smartLinks`) for self-hosted GitLab / Jira
// Data Center. The markdown pipeline runs inside this config, which can't import
// the TS `src/config.ts`, so it reads the vault config off the same env seam —
// absent (plain `npm run dev`, the tests) just means the built-in hosts.
const smartLinkHosts = teamanConfig.smartLinks ?? undefined;

export default defineConfig({
  base,
  outDir,
  publicDir,
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
        [remarkFenceSvg, { cacheDir: join(engineDir, '.diagram-cache') }],
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
        [rehypeReferenceSections, { referencesRoot: join(vaultDir, 'references') }],
      ],
    }),
  },
});
