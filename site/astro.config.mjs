import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkWikiLink from 'remark-wiki-link';
import rehypeCallouts from 'rehype-callouts';

const base = process.env.SITE_BASE ?? '/';

export default defineConfig({
  base,
  outDir: '../public',
  integrations: [mdx()],
  vite: {
    server: {
      fs: { allow: ['..'] },
    },
  },
  markdown: {
    remarkPlugins: [
      [remarkWikiLink, {
        pageResolver: (name) => [name.replace(/ /g, '-').toLowerCase()],
        hrefTemplate: (permalink) => `${base}notes/${permalink}/`,
        aliasDivider: '|',
      }],
    ],
    rehypePlugins: [rehypeCallouts],
  },
});
