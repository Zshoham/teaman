import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import { Writable } from 'stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

import { excalidrawAssets } from '../excalidraw-assets.mjs';

type Middleware = (
  req: { url: string },
  res: Writable & { setHeader: (name: string, value: string) => void },
  next: () => void,
) => void;

function setupMiddleware(base: string): Middleware {
  const integration = excalidrawAssets({ base });
  let middleware: Middleware | undefined;
  integration.hooks['astro:server:setup']({
    server: { middlewares: { use: (handler: Middleware) => { middleware = handler; } } },
  });
  if (!middleware) throw new Error('middleware was not registered');
  return middleware;
}

function collectingResponse() {
  const chunks: Buffer[] = [];
  const headers: Record<string, string> = {};
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  }) as Writable & { setHeader: (name: string, value: string) => void };
  res.setHeader = (name, value) => { headers[name] = value; };
  const finished = new Promise<void>((resolve) => res.on('finish', () => resolve()));
  return { res, headers, finished, byteLength: () => Buffer.concat(chunks).length };
}

// A real font shipped by the package, so the tests exercise the same files the
// integration serves in production.
function sampleFont(): { relPath: string; absPath: string } {
  const fontsDir = join(dirname(require.resolve('@excalidraw/excalidraw')), 'fonts');
  for (const family of readdirSync(fontsDir)) {
    const file = readdirSync(join(fontsDir, family)).find((f) => f.endsWith('.woff2'));
    if (file) return { relPath: `${family}/${file}`, absPath: join(fontsDir, family, file) };
  }
  throw new Error(`no .woff2 fonts found under ${fontsDir}`);
}

describe('excalidrawAssets', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copies the fonts into the build output on astro:build:done', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'teaman-excalidraw-'));
    try {
      excalidrawAssets({ base: '/' }).hooks['astro:build:done']({
        dir: pathToFileURL(`${outDir}/`),
      });

      const staged = join(outDir, 'excalidraw-assets', 'fonts');
      expect(existsSync(staged)).toBe(true);
      expect(readdirSync(staged).length).toBeGreaterThan(0);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('serves font files under the base-prefixed asset path in dev', async () => {
    const middleware = setupMiddleware('/sub-path/');
    const { relPath, absPath } = sampleFont();
    const { res, headers, finished, byteLength } = collectingResponse();
    const next = vi.fn();

    middleware({ url: `/sub-path/excalidraw-assets/fonts/${relPath}` }, res, next);
    await finished;

    expect(next).not.toHaveBeenCalled();
    expect(headers['Content-Type']).toBe('font/woff2');
    expect(byteLength()).toBe(statSync(absPath).size);
  });

  it('passes through non-matching and path-traversal requests', () => {
    const middleware = setupMiddleware('/');
    const { res } = collectingResponse();

    for (const url of [
      '/notes/some-note/',
      '/excalidraw-assets/fonts/../../../package.json',
      '/excalidraw-assets/fonts/%2e%2e/%2e%2e/package.json',
      '/excalidraw-assets/fonts/Missing/nope.woff2',
    ]) {
      const next = vi.fn();
      middleware({ url }, res, next);
      expect(next, url).toHaveBeenCalledOnce();
    }
  });
});
