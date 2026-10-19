import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Writable } from 'node:stream';
import {
  deckEmbedPath,
  htmlEmbedElement,
  htmlEmbedHref,
  htmlEmbeds,
  parseEmbedLabel,
} from '../html-embeds.mjs';
import { htmlEmbedEdits } from '../deck-embeds.mjs';

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratch(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'teaman-embeds-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

describe('parseEmbedLabel', () => {
  it('reads a number as the height, WxH as width and height, anything else as the title', () => {
    expect(parseEmbedLabel(undefined)).toEqual({});
    expect(parseEmbedLabel(' 600 ')).toEqual({ height: 600 });
    expect(parseEmbedLabel('800x600')).toEqual({ width: 800, height: 600 });
    expect(parseEmbedLabel('Our solar system')).toEqual({ title: 'Our solar system' });
  });
});

describe('htmlEmbedHref', () => {
  it('serves from <base>embeds/ with every segment encoded', () => {
    expect(htmlEmbedHref('/', 'attachments/solar-system.html')).toBe('/embeds/attachments/solar-system.html');
    expect(htmlEmbedHref('/docs/', 'My Viz/a&b.html')).toBe('/docs/embeds/My%20Viz/a%26b.html');
  });
});

describe('htmlEmbedElement', () => {
  it('names the frame after the file unless titled, and fixes only an authored height', () => {
    const frame = htmlEmbedElement({ src: '/embeds/x.html', file: '/v/solar-system.html' });
    expect(frame.tagName).toBe('span');
    expect(frame.children[0].properties).toMatchObject({ title: 'Solar system', height: '480', sandbox: 'allow-scripts allow-popups' });
    expect(frame.children[0].properties).not.toHaveProperty('dataFixedHeight');

    const fixed = htmlEmbedElement({ src: '/embeds/x.html', file: '/v/x.html', label: '640x400', block: true });
    expect(fixed.tagName).toBe('figure');
    expect(fixed.children).toHaveLength(1); // a size is not a caption
    expect(fixed.children[0].properties).toMatchObject({ width: '640', height: '400', dataFixedHeight: true });
  });
});

function collectingResponse() {
  const chunks = [];
  const headers = {};
  const res = new Writable({ write(chunk, _encoding, callback) { chunks.push(chunk); callback(); } });
  res.setHeader = (name, value) => { headers[name] = value; };
  const finished = new Promise(resolve => res.on('finish', resolve));
  return { res, headers, finished, body: () => Buffer.concat(chunks).toString() };
}

function middlewareFor(vaultDir, base) {
  let middleware;
  htmlEmbeds({ vaultDir, base }).hooks['astro:server:setup']({
    server: { middlewares: { use: handler => { middleware = handler; } } },
  });
  return middleware;
}

describe('htmlEmbeds', () => {
  it('serves vault HTML under the base-prefixed embeds path in dev', async () => {
    const vault = scratch({ 'attachments/My Viz.html': '<p>hi</p>' });
    const { res, headers, finished, body } = collectingResponse();
    const next = vi.fn();
    middlewareFor(vault, '/sub/')({ url: '/sub/embeds/attachments/My%20Viz.html#planet=mars' }, res, next);
    await finished;
    expect(next).not.toHaveBeenCalled();
    expect(headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(body()).toBe('<p>hi</p>');
  });

  it('passes through anything that is not an HTML file inside the vault', () => {
    const vault = scratch({ 'notes/a.md': '', '.obsidian/x.html': '', 'x.html': '' });
    const middleware = middlewareFor(vault, '/');
    for (const url of [
      '/notes/a/',
      '/embeds/notes/a.md',
      '/embeds/.obsidian/x.html',
      '/embeds/../x.html',
      '/embeds/%2e%2e/%2e%2e/etc/passwd.html',
      '/embeds/missing.html',
    ]) {
      const next = vi.fn();
      middleware({ url }, collectingResponse().res, next);
      expect(next, url).toHaveBeenCalledOnce();
    }
  });

  it('copies exactly the files built pages frame into <out>/embeds/', () => {
    const vault = scratch({ 'attachments/used.html': 'used', 'attachments/unused.html': 'unused', 'a b/c.html': 'spaced' });
    const out = scratch({
      'notes/x/index.html': `<iframe src="/docs/embeds/attachments/used.html#view=sizes"></iframe>`,
      'guides/y/index.html': `<iframe src="/docs/embeds/a%20b/c.html"></iframe><iframe src="/docs/embeds/gone.html"></iframe>`,
    });
    htmlEmbeds({ vaultDir: vault, base: '/docs/' }).hooks['astro:build:done']({ dir: pathToFileURL(`${out}/`) });
    expect(readFileSync(join(out, 'embeds', 'attachments', 'used.html'), 'utf8')).toBe('used');
    expect(readFileSync(join(out, 'embeds', 'a b', 'c.html'), 'utf8')).toBe('spaced');
    expect(existsSync(join(out, 'embeds', 'attachments', 'unused.html'))).toBe(false);
  });
});

describe('deck embeds (slide theme transformer)', () => {
  it('rewrites HTML embeds to <HtmlEmbed>, leaving code and other embeds alone', () => {
    const md = [
      '# Planets',
      '',
      '![[solar-system.html]]',
      'Inline ![[viz/My Viz.html#planet=mars|Mars "up close"]] and `![[code.html]]` and ![[pic.png]]',
      '```md',
      '![[fenced.html]]',
      '```',
      '![[sized.html|640x380]]',
    ].join('\n');
    const edits = htmlEmbedEdits(md);
    expect(edits.map(edit => edit.replacement)).toEqual([
      '<HtmlEmbed src="embeds/solar-system.html" title="Solar system" />',
      '<HtmlEmbed src="embeds/viz/My%20Viz.html#planet=mars" title="Mars &quot;up close&quot;" />',
      '<HtmlEmbed src="embeds/sized.html" title="Sized" :width="640" :height="380" />',
    ]);
    for (const { start, end } of edits) expect(md.slice(start, end)).toMatch(/^!\[\[.*\]\]$/);
  });

  it('reads code spans as whole backtick runs', () => {
    // A double-backtick span may hold single backticks; the embed after it is not code.
    expect(htmlEmbedEdits('``a`b`` ![[viz.html]] `tail`').map(edit => edit.replacement))
      .toEqual(['<HtmlEmbed src="embeds/viz.html" title="Viz" />']);
    expect(htmlEmbedEdits('``code ![[in.html]]`` and `` ` `` ![[out.html]]').map(edit => edit.replacement))
      .toEqual(['<HtmlEmbed src="embeds/out.html" title="Out" />']);
    // An unclosed backtick is literal, so the embed still counts.
    expect(htmlEmbedEdits('a ` b ![[viz.html]]')).toHaveLength(1);
    // Indented code blocks are code too, also inside lists; table cells are not.
    expect(htmlEmbedEdits('Example:\n\n    ![[missing.html]]\n')).toEqual([]);
    expect(htmlEmbedEdits('- item\n\n      ![[in-list-code.html]]\n')).toEqual([]);
    expect(htmlEmbedEdits('| a |\n|---|\n| ![[cell.html]] |\n')).toHaveLength(1);
    // A span may cross lines within a paragraph, but not a blank line.
    expect(htmlEmbedEdits('`literal example\n![[missing.html]]\nend`')).toEqual([]);
    const md = 'open ` tick\n\n![[viz.html]] `x`';
    const [edit] = htmlEmbedEdits(md);
    expect(md.slice(edit.start, edit.end)).toBe('![[viz.html]]');
  });

  it('stages every embed it frames, at the path the frame loads', () => {
    // build-slides stages what htmlEmbedEdits finds; the frame must load the
    // staged path — including embeds inside raw HTML wrappers.
    const md = '![[a.html]]\n\n<div>\n![[./sub/b.htm?x=1|300]]\n</div>\n\n`![[c.html]]`\n\n~~~\n![[d.html]]\n~~~\n';
    const edits = htmlEmbedEdits(md);
    const staged = edits.map(edit => `embeds/${deckEmbedPath(edit.target)}`);
    const framed = edits.map(edit => decodeURIComponent(/src="([^"?#]+)/.exec(edit.replacement)[1]));
    expect(framed).toEqual(staged);
    expect(staged).toEqual(['embeds/a.html', 'embeds/sub/b.htm']);
  });
});
