import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import remarkWikiLink from 'remark-wiki-link';
import rehypeCallouts from 'rehype-callouts';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { remarkStripLeadingH1 } from './src/lib/remark-strip-h1.mjs';
import { remarkMermaid } from './src/lib/remark-mermaid.mjs';
import { normalizeBase } from './src/lib/site-base.mjs';

import react from '@astrojs/react';

// Normalize the same way the build scripts do (single leading + trailing slash)
// so `import.meta.env.BASE_URL` and the wiki-link hrefTemplate below never
// concatenate into broken URLs like `/fooguides/...` for `--base /foo`.
const base = normalizeBase(process.env.TEAMAN_BASE ?? process.env.SITE_BASE);

export default defineConfig({
  base,
  outDir: process.env.TEAMAN_OUT ?? '../public',
  publicDir: process.env.TEAMAN_PUBLIC ?? './resources',
  integrations: [mdx(), react()],
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
      remarkPlugins: [
        remarkStripLeadingH1,
        remarkMermaid,
        [remarkWikiLink, {
          pageResolver: (name) => [name.replace(/ /g, '-').toLowerCase()],
          hrefTemplate: (permalink) => `${base}notes/${permalink}/`,
          aliasDivider: '|',
        }],
      ],
      rehypePlugins: [
        rehypeCallouts,
        rehypeSlug,
        [rehypeAutolinkHeadings, {
          behavior: 'append',
          properties: { className: ['heading-anchor'], 'aria-label': 'Permalink to this heading' },
          content: { type: 'text', value: '#' },
        }],
      ],
    }),
  },
});