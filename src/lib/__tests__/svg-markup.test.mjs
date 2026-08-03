import { describe, it, expect } from 'vitest';
import { svgRootOf, withSvgClass } from '../svg-markup.mjs';
import { escapeAttr, escapeHtml } from '../html-escape.mjs';

describe('svgRootOf', () => {
  it('trims a BOM, XML prolog, doctype and comments', () => {
    const source = '﻿<?xml version="1.0"?>\n<!DOCTYPE svg>\n<!-- made by hand -->\n<svg><g/></svg>\n';
    expect(svgRootOf(source)).toBe('<svg><g/></svg>');
  });

  it('accepts a root tag with attributes', () => {
    expect(svgRootOf('<svg width="10"></svg>')).toBe('<svg width="10"></svg>');
  });

  it('returns null when there is no <svg> root', () => {
    expect(svgRootOf('<html><body>nope</body></html>')).toBeNull();
    // The root tag must be followed by whitespace or `>` so `<svgx>` — a
    // different element — is not mistaken for one. The cost is that a bare
    // `<svg/>` isn't recognised either, which nothing real emits.
    expect(svgRootOf('<svgx/>')).toBeNull();
    expect(svgRootOf('<svg/>')).toBeNull();
  });
});

describe('withSvgClass', () => {
  it('adds a class attribute when the root has none', () => {
    expect(withSvgClass('<svg viewBox="0 0 1 1"/>', ['content-svg']))
      .toBe('<svg class="content-svg" viewBox="0 0 1 1"/>');
  });

  it('preserves classes the author already set', () => {
    expect(withSvgClass('<svg class="mine"/>', ['content-svg', 'tikz-svg']))
      .toBe('<svg class="mine content-svg tikz-svg"/>');
  });

  it('drops empty class names', () => {
    expect(withSvgClass('<svg data-x="1"/>', ['content-svg', undefined])).toBe('<svg class="content-svg" data-x="1"/>');
  });

  it('only touches the root tag, not nested ones', () => {
    expect(withSvgClass('<svg><svg class="inner"/></svg>', ['content-svg']))
      .toBe('<svg class="content-svg"><svg class="inner"/></svg>');
  });
});

describe('html escaping', () => {
  it('escapes text content', () => {
    expect(escapeHtml('a & b <c> "d"')).toBe('a &amp; b &lt;c&gt; "d"');
  });

  it('escapes attribute values, quotes included', () => {
    expect(escapeAttr('a & b <c> "d"')).toBe('a &amp; b &lt;c&gt; &quot;d&quot;');
  });

  it('escapes the ampersand first so entities are not double-built', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('coerces non-strings', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});
