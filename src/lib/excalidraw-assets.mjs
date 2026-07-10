import { createReadStream, cpSync, existsSync } from 'fs';
import { join, dirname, sep } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Excalidraw discovers its drawing fonts at runtime (fetching
// `${EXCALIDRAW_ASSET_PATH}fonts/<Family>/*.woff2`) rather than through CSS
// imports, so Vite cannot fingerprint them into the bundle. Serving them from
// the package's own dist keeps the whiteboard fully local (and base-path safe)
// instead of falling back to Excalidraw's public CDN.
const fontsDir = join(dirname(require.resolve('@excalidraw/excalidraw')), 'fonts');

// Astro integration that makes the fonts available on every entry point of the
// env seam — `astro dev` (middleware) and `astro build`/`astro preview` (copied
// into outDir) — so the plain npm scripts, the e2e suite, and the CLI all
// resolve `${base}excalidraw-assets/fonts/` without the CLI staging anything.
export function excalidrawAssets({ base }) {
  const prefix = `${base}excalidraw-assets/fonts/`;

  return {
    name: 'teaman:excalidraw-assets',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use((req, res, next) => {
          const url = (req.url ?? '').split('?')[0];
          if (!url.startsWith(prefix)) return next();

          let file;
          try {
            file = join(fontsDir, decodeURIComponent(url.slice(prefix.length)));
          } catch {
            return next();
          }
          // join() normalizes any `..` segments; anything that escapes the
          // fonts dir falls through to Astro's own 404 handling.
          if (!file.startsWith(fontsDir + sep) || !existsSync(file)) return next();

          res.setHeader(
            'Content-Type',
            file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream',
          );
          createReadStream(file).pipe(res);
        });
      },
      'astro:build:done': ({ dir }) => {
        cpSync(fontsDir, join(fileURLToPath(dir), 'excalidraw-assets', 'fonts'), {
          recursive: true,
        });
      },
    },
  };
}
