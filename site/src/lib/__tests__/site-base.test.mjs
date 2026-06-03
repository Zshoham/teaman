import { describe, it, expect } from 'vitest';
import { normalizeBase } from '../site-base.mjs';

describe('normalizeBase', () => {
  it('returns root for undefined, empty, or "/"', () => {
    expect(normalizeBase(undefined)).toBe('/');
    expect(normalizeBase('')).toBe('/');
    expect(normalizeBase('/')).toBe('/');
  });

  it('adds a trailing slash to a subpath base', () => {
    expect(normalizeBase('/foo')).toBe('/foo/');
  });

  it('leaves an already-normalized subpath base unchanged', () => {
    expect(normalizeBase('/foo/')).toBe('/foo/');
  });

  it('adds a leading slash when missing', () => {
    expect(normalizeBase('foo')).toBe('/foo/');
    expect(normalizeBase('foo/bar')).toBe('/foo/bar/');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeBase('  /foo  ')).toBe('/foo/');
  });

  it('composes into a clean asset URL', () => {
    const base = normalizeBase('/foo');
    expect(`${base}slides/talk/`).toBe('/foo/slides/talk/');
  });
});
