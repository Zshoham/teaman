import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { failOnEmbedErrors } from './src/lib/remark-wiki-links.mjs';
import { siteMarkdownConfig } from './src/lib/site-markdown.mjs';
import { excalidrawAssets } from './src/lib/excalidraw-assets.mjs';
import { htmlEmbeds } from './src/lib/html-embeds.mjs';
import {
  engineDir,
  outDir,
  publicDir,
  siteBase as base,
  siteConfig,
  vaultDir,
} from './src/lib/build-env.mjs';

import react from '@astrojs/react';

export default defineConfig({
  base,
  outDir,
  publicDir,
  integrations: [
    mdx(),
    // Compile islands that explicitly opt in with "use memo". Keep diagnostics
    // visible so a future compiler bailout does not silently lose memoization.
    react({ compiler: {
      compilationMode: 'annotation',
      reportDiagnostics: true,
      logDiagnostics: true,
    } }),
    excalidrawAssets({ base }),
    // `![[viz.html]]` frames load `${base}embeds/<vault path>`.
    htmlEmbeds({ vaultDir, base }),
    failOnEmbedErrors(),
  ],
  vite: {
    plugins: [tailwindcss()],
    server: {
      fs: { allow: ['..'] },
    },
  },
  markdown: siteMarkdownConfig({
    vaultDir,
    base,
    engineDir,
    publicDir,
    // Smart-link host overrides (`config.smartLinks`) for self-hosted GitLab /
    // Jira Data Center; absent just means the built-in hosts.
    smartLinkHosts: siteConfig.smartLinks,
  }),
});
