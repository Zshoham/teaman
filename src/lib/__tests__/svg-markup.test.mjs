import { describe, it, expect } from 'vitest';
import { diagramScroll, rawSvgSpan, svgNaturalWidth, svgRootOf, withRawSvgScroll, withSvgClass } from '../svg-markup.mjs';
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

describe('diagramScroll', () => {
  it('wraps a block svg in the scroller that holds its minimum width', () => {
    expect(diagramScroll('<svg><g/></svg>')).toBe('<div class="diagram-scroll"><svg><g/></svg></div>');
  });

  it('hands a self-sizing svg its natural width', () => {
    expect(diagramScroll('<svg/>', 640)).toBe('<div class="diagram-scroll" style="--diagram-width: 640px"><svg/></div>');
  });
});

describe('rawSvgSpan', () => {
  it('spans the first top-level svg, nested svg elements included', () => {
    const html = '<figure>\n<svg a="1"><svg/><svg><g/></svg></svg>\n<figcaption>c</figcaption></figure>';
    const { start, end } = rawSvgSpan(html);
    expect(html.slice(start, end)).toBe('<svg a="1"><svg/><svg><g/></svg></svg>');
  });

  it('spans a self-closing root', () => {
    expect(rawSvgSpan('<p>x</p><svg width="1"/>')).toEqual({ start: 8, end: 24 });
  });

  it('is null for an unclosed svg, or a different element', () => {
    expect(rawSvgSpan('<svg viewBox="0 0 1 1">\n<g/>')).toBeNull();
    expect(rawSvgSpan('<svg-icon></svg-icon>')).toBeNull();
    expect(rawSvgSpan('<div>no drawing</div>')).toBeNull();
  });
});

describe('svgNaturalWidth', () => {
  it('reads an absolute width first', () => {
    expect(svgNaturalWidth('<svg width="300" viewBox="0 0 900 10">')).toBe(300);
    expect(svgNaturalWidth("<svg width='300px'>")).toBe(300);
  });

  it('falls back to the viewBox width for a relative or missing width', () => {
    expect(svgNaturalWidth('<svg viewBox="0 0 640 180" width="100%">')).toBe(640);
    expect(svgNaturalWidth('<svg viewBox="0,0,640.5,1">')).toBe(640.5);
    expect(svgNaturalWidth('<svg width="40em" viewBox="-10 -10 200 10">')).toBe(200);
  });

  it('is null when neither says', () => {
    expect(svgNaturalWidth('<svg width="100%">')).toBeNull();
    expect(svgNaturalWidth('<svg>')).toBeNull();
  });

  it('reads only the root tag', () => {
    expect(svgNaturalWidth('<svg><rect width="5"/></svg>')).toBeNull();
  });
});

describe('withRawSvgScroll', () => {
  it('preserves an existing scroller, including inside a captioned figure', () => {
    for (const width of [null, 640]) {
      const wrapped = diagramScroll('<svg viewBox="0 0 640 1"></svg>', width);
      expect(withRawSvgScroll(wrapped)).toBe(wrapped);
      const figure = `<figure class="content-figure">${wrapped}<figcaption>c</figcaption></figure>`;
      expect(withRawSvgScroll(figure)).toBe(figure);
    }
  });

  it('wraps the svg alone, leaving a caption outside', () => {
    expect(withRawSvgScroll('<figure><svg viewBox="0 0 640 1"></svg><figcaption>c</figcaption></figure>'))
      .toBe('<figure><div class="diagram-scroll" style="--diagram-width: 640px"><svg viewBox="0 0 640 1"></svg></div><figcaption>c</figcaption></figure>');
  });

  it('leaves a block with no svg unchanged', () => {
    expect(withRawSvgScroll('<details><summary>x</summary></details>')).toBe('<details><summary>x</summary></details>');
  });
});
