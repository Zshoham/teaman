import { describe, it, expect } from 'vitest';
import { parseDeck } from '../parse-deck.mjs';

describe('parseDeck', () => {
  it('returns null title and full content when there is no frontmatter', () => {
    const md = '# Slide 1\n\nContent here.\n\n---\n\n# Slide 2\n\nMore content.';
    const { title, content } = parseDeck(md);
    expect(title).toBeNull();
    expect(content).toContain('Slide 1');
    expect(content).toContain('Slide 2');
  });

  it('extracts the title from frontmatter', () => {
    const md = '---\ntitle: My Presentation\ntheme: default\n---\n\n# First Slide';
    const { title, content } = parseDeck(md);
    expect(title).toBe('My Presentation');
    expect(content).toContain('First Slide');
    expect(content).not.toContain('title:');
  });

  it('strips double-quoted title values', () => {
    const md = '---\ntitle: "Quoted Title"\n---\n\n# Content';
    expect(parseDeck(md).title).toBe('Quoted Title');
  });

  it('strips single-quoted title values', () => {
    const md = "---\ntitle: 'Single Quoted'\n---\n\n# Content";
    expect(parseDeck(md).title).toBe('Single Quoted');
  });

  it('strips slide separator lines from the content', () => {
    const md = '# Slide 1\n\n---\n\n# Slide 2';
    const { content } = parseDeck(md);
    expect(content).not.toMatch(/^---\s*$/m);
    expect(content).toContain('Slide 1');
    expect(content).toContain('Slide 2');
  });

  it('returns empty content for an empty string', () => {
    const { title, content } = parseDeck('');
    expect(title).toBeNull();
    expect(content).toBe('');
  });

  it('does not treat a non-leading --- as frontmatter', () => {
    const md = 'Not frontmatter\n---\nmore text';
    const { title } = parseDeck(md);
    expect(title).toBeNull();
  });

  it('trims leading and trailing whitespace from content', () => {
    const md = '\n\n# Slide\n\n';
    const { content } = parseDeck(md);
    expect(content).toBe('# Slide');
  });

  it('handles frontmatter followed by multiple slide separators', () => {
    const md = '---\ntitle: Talk\n---\n\n# A\n\n---\n\n# B\n\n---\n\n# C';
    const { title, content } = parseDeck(md);
    expect(title).toBe('Talk');
    expect(content).toContain('# A');
    expect(content).toContain('# B');
    expect(content).toContain('# C');
    expect(content).not.toMatch(/^---\s*$/m);
  });
});
