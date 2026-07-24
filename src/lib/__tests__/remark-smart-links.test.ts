import { describe, it, expect } from 'vitest';
import { remarkSmartLinks } from '../remark-smart-links.mjs';

// Minimal mdast-compatible node factories.
const text = (value: string) => ({ type: 'text', value });
const link = (url: string, ...children: object[]) => ({
  type: 'link',
  url,
  children: children.length ? children : [text(url)],
});
const para = (...children: object[]) => ({ type: 'paragraph', children });

function run(children: object[], options?: object) {
  const tree = { type: 'root', children: [...children] };
  remarkSmartLinks(options as never)(tree as any);
  return tree.children as any[];
}

/** Transform a single link and return the rendered html string. */
function html(url: string, label?: string, options?: object) {
  const node = label ? link(url, text(label)) : link(url);
  const result = run([para(node)], options);
  return result[0].children[0].value as string;
}

describe('remarkSmartLinks — labelled links', () => {
  it('renders a stub + tail chip for a labelled gitlab MR', () => {
    const out = html('https://gitlab.com/platform/api/-/merge_requests/284', 'Drop the write-through layer');
    expect(out).toContain('class="tm-link"');
    expect(out).toContain('data-tm-service="gitlab"');
    expect(out).toContain('data-tm-kind="merge_request"');
    expect(out).toContain('<span class="tm-ref">!284</span>');
    expect(out).toContain('<span class="tm-tail">Drop the write-through layer</span>');
    expect(out).not.toContain('tm-bare');
  });

  it('uses the short ref when a label supplies the context', () => {
    const out = html('https://gitlab.com/platform/api/-/issues/77', 'Backfill stale keys');
    expect(out).toContain('>#77<');
    expect(out).not.toContain('platform/api#77</span>');
  });

  it('carries the full ref and the host in the title attribute', () => {
    const out = html('https://gitlab.com/platform/api/-/issues/77', 'Backfill stale keys');
    expect(out).toContain('title="platform/api#77 · gitlab.com"');
  });

  it('flattens emphasis inside the label rather than nesting it', () => {
    const node = link('https://acme.atlassian.net/browse/PLAT-412', {
      type: 'emphasis',
      children: [text('Rewrite '), text('invalidation')],
    });
    const out = run([para(node)])[0].children[0].value;
    expect(out).toContain('<span class="tm-tail">Rewrite invalidation</span>');
    expect(out).not.toContain('<em>');
  });
});

describe('remarkSmartLinks — bare links', () => {
  it('renders the stub alone with the qualified ref for a bare URL', () => {
    const out = html('https://gitlab.com/platform/api/-/merge_requests/284');
    expect(out).toContain('class="tm-link tm-bare"');
    expect(out).toContain('<span class="tm-ref">platform/api!284</span>');
    expect(out).not.toContain('tm-tail');
  });

  it('treats link text that just repeats the ref as no label', () => {
    expect(html('https://acme.atlassian.net/browse/PLAT-412', 'PLAT-412')).toContain('tm-bare');
    expect(html('https://gitlab.com/platform/api/-/issues/77', 'platform/api#77')).toContain('tm-bare');
  });

  it('treats a scheme-less repeat of the url as no label', () => {
    const url = 'https://gitlab.com/platform/api/-/issues/77';
    expect(html(url, 'gitlab.com/platform/api/-/issues/77')).toContain('tm-bare');
  });

  it('recovers a label from the confluence slug when the link has none', () => {
    const out = html('https://acme.atlassian.net/wiki/spaces/ENG/pages/884736/Cache+Invalidation+Strategy');
    expect(out).not.toContain('tm-bare');
    expect(out).toContain('<span class="tm-ref">ENG</span>');
    expect(out).toContain('<span class="tm-tail">Cache Invalidation Strategy</span>');
  });
});

describe('remarkSmartLinks — pass-through', () => {
  it('leaves an unrecognised host as an ordinary link node', () => {
    const node = link('https://example.com/whatever', text('docs'));
    const result = run([para(node)]);
    expect(result[0].children[0]).toBe(node);
  });

  it('leaves in-site links (wiki-link output) untouched', () => {
    const node = link('/notes/vault-architecture/', text('vault architecture'));
    expect(run([para(node)])[0].children[0]).toBe(node);
  });

  it('transforms links nested inside other containers', () => {
    const result = run([
      { type: 'blockquote', children: [para(link('https://gitlab.com/platform/api/-/issues/77'))] },
    ]);
    expect(result[0].children[0].children[0].type).toBe('html');
  });

  it('leaves a document with no links unchanged', () => {
    const result = run([para(text('nothing to see'))]);
    expect(result[0].children[0]).toMatchObject({ type: 'text' });
  });
});

describe('remarkSmartLinks — configuration & escaping', () => {
  it('honours vault-configured self-hosted hosts', () => {
    const out = html('https://gitlab.acme.io/platform/api/-/issues/77', 'Backfill', {
      hosts: { gitlab: ['gitlab.acme.io'] },
    });
    expect(out).toContain('data-tm-service="gitlab"');
    expect(out).toContain('title="platform/api#77 · gitlab.acme.io"');
  });

  it('still recognises the built-in hosts when overrides are configured', () => {
    const out = html('https://gitlab.com/platform/api/-/issues/77', 'Backfill', {
      hosts: { gitlab: ['gitlab.acme.io'] },
    });
    expect(out).toContain('data-tm-service="gitlab"');
  });

  it('escapes html-special characters in the label and the href', () => {
    const out = html(
      'https://gitlab.com/platform/api/-/issues/77?a=1&b=2',
      'Fix <script> & "quotes"',
    );
    expect(out).toContain('Fix &lt;script&gt; &amp; &quot;quotes&quot;');
    expect(out).toContain('href="https://gitlab.com/platform/api/-/issues/77?a=1&amp;b=2"');
    expect(out).not.toContain('<script>');
  });

  it('escapes a title recovered from a confluence slug', () => {
    const out = html('https://acme.atlassian.net/wiki/spaces/ENG/pages/1/A%20%3Cb%3E%20title');
    expect(out).toContain('&lt;b&gt;');
    expect(out).not.toContain('<b>');
  });
});
