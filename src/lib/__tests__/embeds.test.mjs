import { describe, expect, it } from 'vitest';
import { embedKind, readEmbed, resolveEmbed, splitWikiTarget } from '../embeds.mjs';

describe('splitWikiTarget', () => {
  it('splits at the first pipe and trims both sides', () => {
    expect(splitWikiTarget(' note ')).toEqual({ target: 'note' });
    expect(splitWikiTarget('pic.png | a|b ')).toEqual({ target: 'pic.png', label: 'a|b' });
    expect(splitWikiTarget('pic.png|')).toEqual({ target: 'pic.png', label: '' });
  });
});

describe('embedKind', () => {
  it('tells images and HTML pages from notes by extension, ignoring a suffix', () => {
    expect(embedKind('pic.PNG')).toBe('image');
    expect(embedKind('viz.html')).toBe('html');
    expect(embedKind('Viz.HTM#planet=mars')).toBe('html');
    expect(embedKind('viz.html.png')).toBe('image');
    expect(embedKind('a.png.html')).toBe('html');
    expect(embedKind('Some Note')).toBe('note');
    expect(embedKind('notes/page.md')).toBe('note');
  });
});

describe('readEmbed', () => {
  it("reads an image's lone number as its width, as Obsidian does", () => {
    expect(readEmbed('pic.png', '300')).toMatchObject({ kind: 'image', width: 300 });
    expect(readEmbed('pic.png', '300')).not.toHaveProperty('height');
    expect(readEmbed('pic.png', '300x200')).toMatchObject({ width: 300, height: 200 });
  });

  it("reads a frame's lone number as its height, since a frame fills the column", () => {
    expect(readEmbed('x.html', ' 600 ')).toMatchObject({ title: 'X', height: 600 });
    expect(readEmbed('x.html', ' 600 ')).not.toHaveProperty('width');
    expect(readEmbed('x.html', '800x600')).toMatchObject({ width: 800, height: 600 });
  });

  it('reads any other label as the caption, and the target as no label', () => {
    expect(readEmbed('solar-system.html')).toEqual({
      target: 'solar-system.html', kind: 'html', path: 'solar-system.html', suffix: '', title: 'Solar system',
    });
    expect(readEmbed('x.html', 'Our solar system')).toMatchObject({ title: 'Our solar system', caption: 'Our solar system' });
    expect(readEmbed('pic.png', 'pic.png')).not.toHaveProperty('caption');
    expect(readEmbed('pic.png', '')).not.toHaveProperty('caption');
  });

  it('splits the path the vault is searched by from the query or fragment the embed reads', () => {
    expect(readEmbed(' ./viz/My Viz.html#planet=mars ')).toMatchObject({ path: 'viz/My Viz.html', suffix: '#planet=mars' });
    expect(readEmbed('/a.htm?x=1')).toMatchObject({ path: 'a.htm', suffix: '?x=1', title: 'A' });
  });
});

describe('resolveEmbed', () => {
  const resolveAttachment = (target, from) => (target.startsWith('pic.png') ? `/v/attachments/pic.png@${from}` : null);

  it('finds the file from the file the embed is written in', () => {
    expect(resolveEmbed('pic.png', '300', { resolveAttachment, fromFile: '/v/notes/a.md' }))
      .toMatchObject({ file: '/v/attachments/pic.png@/v/notes/a.md', problem: null, width: 300 });
  });

  it('names a missing file and a note embed as problems, never looking a note up', () => {
    expect(resolveEmbed('gone.png', undefined, { resolveAttachment }).problem)
      .toBe('![[gone.png]]: no image named “gone.png” in the vault');
    expect(resolveEmbed('gone.html', undefined, { resolveAttachment }).problem)
      .toBe('![[gone.html]]: no HTML file named “gone.html” in the vault');
    const lookups = [];
    expect(resolveEmbed('Some Note', undefined, { resolveAttachment: target => (lookups.push(target), null) }).problem)
      .toBe('![[Some Note]] embeds a note, which teaman does not support — link it with [[Some Note]] instead');
    expect(lookups).toEqual([]);
  });

  it('finds nothing without an attachment lookup', () => {
    expect(resolveEmbed('pic.png').problem).toBe('![[pic.png]]: no image named “pic.png” in the vault');
  });
});
