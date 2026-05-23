import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import remarkWikiLink from 'remark-wiki-link';
import rehypeCallouts from 'rehype-callouts';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { remarkStripLeadingH1 } from './src/lib/remark-strip-h1.mjs';

import react from '@astrojs/react';

const base = process.env.SITE_BASE ?? '/';

export default defineConfig({
  base,
  outDir: '../public',
  publicDir: './resources',
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
    remarkPlugins: [
      remarkStripLeadingH1,
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
  },
});