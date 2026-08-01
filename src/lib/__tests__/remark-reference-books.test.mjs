import { describe, expect, it } from 'vitest';
import { remarkReferenceBooks } from '../remark-reference-books.mjs';

const text = value => ({ type: 'text', value });
const marker = path => ({ type: 'html', value: `<!--teaman-reference-chapter:${path}-->` });
const assignedMarker = (path, anchor) => ({
  type: 'html',
  value: `<!--teaman-reference-chapter:${encodeURIComponent(path)}|${encodeURIComponent(anchor)}-->`,
});

describe('remarkReferenceBooks', () => {
  it('namespaces chapter-local references and rewrites local chapter jumps', () => {
    const firstReference = { type: 'linkReference', identifier: 'syntax', children: [text('syntax')] };
    const definition = { type: 'definition', identifier: 'syntax', url: '#syntax' };
    const crossHeading = { type: 'link', url: 'items/functions.md#parameters', children: [text('parameters')] };
    const crossChapter = { type: 'link', url: 'items/functions.md', children: [text('functions')] };
    const crossRule = { type: 'link', url: 'items/functions.md#r-items.fn', children: [text('rule')] };
    const image = { type: 'image', url: 'images/map.svg', alt: 'Map' };
    const chapterMarker = marker('intro.md');
    const firstHeading = { type: 'heading', depth: 2, children: [text('Introduction')] };
    const duplicateA = { type: 'heading', depth: 3, children: [text('Syntax')] };
    const duplicateB = { type: 'heading', depth: 3, children: [text('Syntax')] };
    const secondHeading = { type: 'heading', depth: 3, children: [text('Functions')] };
    const tree = {
      type: 'root',
      children: [
        chapterMarker,
        firstHeading,
        duplicateA,
        duplicateB,
        { type: 'paragraph', children: [firstReference, crossHeading, crossChapter, crossRule, image] },
        definition,
        marker('items%2Ffunctions.md'),
        secondHeading,
      ],
    };

    remarkReferenceBooks()(tree);

    expect(firstHeading.data.hProperties.id).toBe('intro');
    expect(duplicateA.data.hProperties.id).toBe('intro--syntax');
    expect(duplicateB.data.hProperties.id).toBe('intro--syntax-1');
    expect(firstReference.identifier).toBe('intro:syntax');
    expect(definition.identifier).toBe('intro:syntax');
    expect(definition.url).toBe('#intro--syntax');
    expect(crossHeading.url).toBe('#items--functions--parameters');
    expect(crossChapter.url).toBe('#items--functions');
    expect(crossRule.url).toBe('#r-items.fn');
    expect(image.url).toBe('images/map.svg');
    expect(secondHeading.data.hProperties.id).toBe('items--functions');
    expect(chapterMarker.value).toBe('');
  });

  it('resolves a link to a chapter title onto that chapter heading', () => {
    const heading = { type: 'heading', depth: 2, children: [text('If expressions')] };
    const repeated = { type: 'heading', depth: 3, children: [text('If expressions')] };
    const cross = { type: 'link', url: 'expressions/if-expr.md#if-expressions', children: [text('if')] };
    const crossRepeat = { type: 'link', url: 'expressions/if-expr.md#if-expressions-1', children: [text('again')] };
    const local = { type: 'link', url: '#if-expressions', children: [text('above')] };
    const tree = {
      type: 'root',
      children: [
        marker('expressions%2Fif-expr.md'),
        heading,
        repeated,
        { type: 'paragraph', children: [local] },
        marker('destructors.md'),
        { type: 'paragraph', children: [cross, crossRepeat] },
      ],
    };

    remarkReferenceBooks()(tree);

    expect(heading.data.hProperties.id).toBe('expressions--if-expr');
    expect(repeated.data.hProperties.id).toBe('expressions--if-expr--if-expressions-1');
    expect(cross.url).toBe('#expressions--if-expr');
    expect(crossRepeat.url).toBe('#expressions--if-expr--if-expressions-1');
    expect(local.url).toBe('#expressions--if-expr');
  });

  it('rewrites declared extensionless rule targets without capturing ordinary extensionless links', () => {
    const ruleDefinition = { type: 'definition', identifier: 'rule', url: 'language.item.valid' };
    const ordinary = { type: 'link', url: 'release-notes', children: [text('notes')] };
    const tree = {
      type: 'root',
      children: [
        marker('syntax.md'),
        { type: 'heading', depth: 2, children: [text('Syntax')] },
        { type: 'html', value: '<a id="r-language.item.valid"></a>' },
        { type: 'paragraph', children: [ordinary] },
        ruleDefinition,
      ],
    };

    remarkReferenceBooks()(tree);

    expect(ruleDefinition.url).toBe('#r-language.item.valid');
    expect(ordinary.url).toBe('release-notes');
  });

  it('decodes encoded chapter paths and fragments before resolving their anchors', () => {
    const cross = {
      type: 'link',
      url: 'my%20chapter.md#caf%C3%A9',
      children: [text('Café')],
    };
    const tree = {
      type: 'root',
      children: [
        marker('my%20chapter.md'),
        { type: 'heading', depth: 2, children: [text('My chapter')] },
        { type: 'heading', depth: 3, children: [text('Café')] },
        marker('links.md'),
        { type: 'heading', depth: 2, children: [text('Links')] },
        { type: 'paragraph', children: [cross] },
      ],
    };

    remarkReferenceBooks()(tree);

    expect(cross.url).toBe('#my-chapter--café');
  });

  it('uses assigned anchors for colliding chapter slugs and every cross-chapter link', () => {
    const hyphenLink = { type: 'link', url: 'foo-bar.md', children: [text('hyphen')] };
    const underscoreLink = { type: 'link', url: 'foo_bar.md', children: [text('underscore')] };
    const hyphenHeading = { type: 'heading', depth: 2, children: [text('Hyphen')] };
    const underscoreHeading = { type: 'heading', depth: 2, children: [text('Underscore')] };
    const tree = {
      type: 'root',
      children: [
        assignedMarker('foo-bar.md', 'foo-bar'),
        hyphenHeading,
        assignedMarker('foo_bar.md', 'foo-bar--2'),
        underscoreHeading,
        assignedMarker('links.md', 'links'),
        { type: 'heading', depth: 2, children: [text('Links')] },
        { type: 'paragraph', children: [hyphenLink, underscoreLink] },
      ],
    };

    remarkReferenceBooks()(tree);

    expect(hyphenHeading.data.hProperties.id).toBe('foo-bar');
    expect(underscoreHeading.data.hProperties.id).toBe('foo-bar--2');
    expect(hyphenLink.url).toBe('#foo-bar');
    expect(underscoreLink.url).toBe('#foo-bar--2');
  });

  it('keeps angle brackets that come from inline code in heading ids', () => {
    const heading = {
      type: 'heading',
      depth: 3,
      children: [{ type: 'inlineCode', value: 'Box<T>' }],
    };
    const title = { type: 'heading', depth: 2, children: [text('Special types and traits')] };
    const tree = { type: 'root', children: [marker('special-types-and-traits.md'), title, heading] };

    remarkReferenceBooks()(tree);

    expect(heading.data.hProperties.id).toBe('special-types-and-traits--boxt');
  });

  it('slugs headings the way mdBook does, without trimming or collapsing', () => {
    const trailing = {
      type: 'heading',
      depth: 3,
      children: [text('Shared references ('), { type: 'inlineCode', value: '&' }, text(')')],
    };
    const interior = {
      type: 'heading',
      depth: 3,
      children: [
        text('References ('),
        { type: 'inlineCode', value: '&' },
        text(' and '),
        { type: 'inlineCode', value: '&mut' },
        text(')'),
      ],
    };
    const title = { type: 'heading', depth: 2, children: [text('Pointer types')] };
    const tree = { type: 'root', children: [marker('types%2Fpointer.md'), title, trailing, interior] };

    remarkReferenceBooks()(tree);

    expect(trailing.data.hProperties.id).toBe('types--pointer--shared-references-');
    expect(interior.data.hProperties.id).toBe('types--pointer--references--and-mut');
  });

  it('lowercases Unicode in heading and chapter-title fragments', () => {
    const chapterTitle = { type: 'heading', depth: 2, children: [text('Änderung')] };
    const childHeading = { type: 'heading', depth: 3, children: [text('Überblick')] };
    const local = { type: 'link', url: '#überblick', children: [text('overview')] };
    const cross = { type: 'link', url: 'änderung.md#änderung', children: [text('change')] };
    const tree = {
      type: 'root',
      children: [
        marker('änderung.md'),
        chapterTitle,
        childHeading,
        { type: 'paragraph', children: [local] },
        marker('links.md'),
        { type: 'paragraph', children: [cross] },
      ],
    };

    remarkReferenceBooks()(tree);

    expect(chapterTitle.data.hProperties.id).toBe('änderung');
    expect(childHeading.data.hProperties.id).toBe('änderung--überblick');
    expect(local.url).toBe('#änderung--überblick');
    expect(cross.url).toBe('#änderung');
  });

  it('namespaces ids declared by raw HTML, leaving rule anchors global', () => {
    const span = { type: 'html', value: '<span id="field-less-enum"></span>' };
    const rule = { type: 'html', value: '<a id="r-items.enum" class="reference-rule-anchor"></a>' };
    const link = { type: 'link', url: '#field-less-enum', children: [text('field-less')] };
    const tree = {
      type: 'root',
      children: [
        marker('items%2Fenumerations.md'),
        { type: 'paragraph', children: [span, rule, link] },
      ],
    };

    remarkReferenceBooks()(tree);

    expect(span.value).toBe('<span id="items--enumerations--field-less-enum"></span>');
    expect(rule.value).toBe('<a id="r-items.enum" class="reference-rule-anchor"></a>');
    expect(link.url).toBe('#items--enumerations--field-less-enum');
  });

  it('ignores raw HTML inside a heading when building its id', () => {
    const heading = {
      type: 'heading',
      depth: 3,
      children: [text('Lifetime bounds'), { type: 'html', value: '<sup>1</sup>' }],
    };
    const title = { type: 'heading', depth: 2, children: [text('Trait bounds')] };
    const tree = { type: 'root', children: [marker('trait-bounds.md'), title, heading] };

    remarkReferenceBooks()(tree);

    expect(heading.data.hProperties.id).toBe('trait-bounds--lifetime-bounds');
  });
});
