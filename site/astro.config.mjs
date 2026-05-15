import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkWikiLink from 'remark-wiki-link';
import rehypeCallouts from 'rehype-callouts';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

// The page layout already renders a title (from frontmatter for notes, from
// SUMMARY.md for guide chapters). Authors keep a `# Title` line at the top of
// their files for Obsidian/GitHub previews — strip it so it doesn't render
// twice on the site.
function remarkStripLeadingH1() {
  return (tree) => {
    const i = tree.children.findIndex(c => c.type !== 'yaml' && c.type !== 'toml');
    if (i !== -1 && tree.children[i].type === 'heading' && tree.children[i].depth === 1) {
      tree.children.splice(i, 1);
    }
  };
}

const base = process.env.SITE_BASE ?? '/';

export default defineConfig({
  base,
  outDir: '../public',
  publicDir: './resources',
  integrations: [mdx()],
  vite: {
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
