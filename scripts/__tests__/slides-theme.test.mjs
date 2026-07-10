import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';

import {
  renderVarsCss,
  renderLogoConfig,
  resolveLogoSource,
  slidevBuildArgs,
  renderViteConfig,
  DEFAULT_SLIDE_PRIMARY,
  DEFAULT_SLIDE_SECONDARY,
} from '../slides-theme.mjs';

const themeDir = fileURLToPath(new URL('../../slidev-theme-teaman', import.meta.url));

describe('renderVarsCss', () => {
  it('substitutes the configured accents', () => {
    const css = renderVarsCss({ primary: 'red', secondary: '#0af' });
    expect(css).toContain('--slidev-theme-primary: red;');
    expect(css).toContain('--slidev-theme-secondary: #0af;');
  });

  it('falls back to the defaults when knobs are missing or blank', () => {
    const css = renderVarsCss({ primary: '  ' });
    expect(css).toContain(`--slidev-theme-primary: ${DEFAULT_SLIDE_PRIMARY};`);
    expect(css).toContain(`--slidev-theme-secondary: ${DEFAULT_SLIDE_SECONDARY};`);
  });

  it('keeps the page tones fixed (not configurable)', () => {
    const css = renderVarsCss({ primary: 'red' });
    expect(css).toContain('--teaman-slide-bg: oklch(0.992 0.004 95);');
    expect(css).toMatch(/html\.dark\s*{/);
  });

  it('default accents match the committed vars.css fallbacks', () => {
    const committed = readFileSync(join(themeDir, 'styles', 'vars.css'), 'utf8');
    expect(committed).toContain(`--slidev-theme-primary: ${DEFAULT_SLIDE_PRIMARY};`);
    expect(committed).toContain(`--slidev-theme-secondary: ${DEFAULT_SLIDE_SECONDARY};`);
  });
});

describe('renderLogoConfig', () => {
  it('emits the filename', () => {
    expect(renderLogoConfig('teaman-slide-logo.svg')).toContain(
      'export const logoFile: string | null = "teaman-slide-logo.svg"',
    );
  });
  it('emits null when there is no logo', () => {
    expect(renderLogoConfig(null)).toContain('export const logoFile: string | null = null');
  });
  it('defaults the footer on', () => {
    expect(renderLogoConfig('logo.svg')).toContain('export const showFooter: boolean = true');
  });
  it('disables the footer when asked', () => {
    expect(renderLogoConfig('logo.svg', { footer: false })).toContain(
      'export const showFooter: boolean = false',
    );
  });
});

describe('slidevBuildArgs', () => {
  const args = slidevBuildArgs('/tmp/deck.md', { out: '/out', theme: '/theme' });

  it('builds the given deck into the given out dir with the theme', () => {
    expect(args.slice(0, 3)).toEqual(['slidev', 'build', '/tmp/deck.md']);
    expect(args).toContain('--out');
    expect(args[args.indexOf('--out') + 1]).toBe('/out');
    expect(args[args.indexOf('--theme') + 1]).toBe('/theme');
  });

  // These two flags are the slide-navigation fix; dropping either reintroduces
  // the base-doubling 404 / breaks deep links on a static host. e2e/slides.test.ts
  // exercises the runtime behaviour; this is the fast guard.
  it('pins relative base + hash routing', () => {
    expect(args[args.indexOf('--base') + 1]).toBe('./');
    expect(args[args.indexOf('--router-mode') + 1]).toBe('hash');
  });
});

describe('slidev router paths', () => {
  // Slidev < 52.17 baked BASE_URL into router paths, which broke presenter /
  // overview navigation under the relative `--base ./`; teaman patched it via a
  // staged Vite plugin until 52.17 shipped the fix (getSlideRoutePath returning
  // absolute, base-less paths). This reads the installed client source so a
  // Slidev upgrade that re-introduces BASE_URL into router paths fails here,
  // not as silently broken slide navigation on a deployed site.
  it('upstream getSlideRoutePath returns absolute, base-less paths', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../node_modules/@slidev/client/logic/slidePath.ts', import.meta.url)),
      'utf8',
    );
    expect(src).not.toContain('import.meta.env.BASE_URL');
    expect(src).toContain('`/${no}`');
    expect(src).toContain('`/presenter/${no}`');
  });

  it('renderViteConfig only carries the Rolldown checks knob', () => {
    const cfg = renderViteConfig();
    expect(cfg).toContain('export default');
    // Mutes @vueuse/core's INVALID_ANNOTATION noise via the Rolldown checks knob.
    expect(cfg).toContain('invalidAnnotation: false');
    expect(cfg).not.toContain('getSlidePath');
  });
});

describe('resolveLogoSource', () => {
  const vaultDir = '/vault';
  const teamanPublic = '/staged';

  it('returns null without a logo', () => {
    expect(resolveLogoSource(null, { vaultDir })).toBe(null);
    expect(resolveLogoSource(undefined, { vaultDir })).toBe(null);
  });

  it('prefers the staged public dir, then vault/public, then vault root', () => {
    const exists = (p) => p === '/vault/public/logo.svg';
    expect(resolveLogoSource('logo.svg', { teamanPublic, vaultDir, exists })).toBe('/vault/public/logo.svg');

    const stagedWins = (p) => p === '/staged/logo.svg' || p === '/vault/public/logo.svg';
    expect(resolveLogoSource('logo.svg', { teamanPublic, vaultDir, exists: stagedWins })).toBe('/staged/logo.svg');
  });

  it('honours an absolute path only when it exists', () => {
    expect(resolveLogoSource('/abs/logo.svg', { vaultDir, exists: (p) => p === '/abs/logo.svg' })).toBe('/abs/logo.svg');
    expect(resolveLogoSource('/abs/logo.svg', { vaultDir, exists: () => false })).toBe(null);
  });

  it('returns null when nothing matches', () => {
    expect(resolveLogoSource('missing.svg', { teamanPublic, vaultDir, exists: () => false })).toBe(null);
  });
});
