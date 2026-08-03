import { describe, it, expect } from 'vitest';

import { plural, readingTimeMeta, wordCount, wordMeta } from '../text';

describe('plural', () => {
  it('uses the singular for exactly one', () => {
    expect(plural(1, 'section')).toBe('1 section');
  });

  it('appends s for anything else, zero included', () => {
    expect(plural(0, 'section')).toBe('0 sections');
    expect(plural(2, 'section')).toBe('2 sections');
  });

  it('takes an explicit plural for irregular nouns', () => {
    expect(plural(1, 'daily', 'dailies')).toBe('1 daily');
    expect(plural(3, 'daily', 'dailies')).toBe('3 dailies');
  });

  it('formats large counts with separators', () => {
    expect(plural(1234, 'word')).toBe('1,234 words');
  });
});

describe('wordMeta', () => {
  it('reads as a count of words', () => {
    expect(wordMeta(1)).toBe('1 words');
    expect(wordMeta(2500)).toBe('2,500 words');
  });
});

describe('readingTimeMeta', () => {
  it('rounds up to whole minutes at 220wpm', () => {
    expect(readingTimeMeta(220)).toBe('1 min read');
    expect(readingTimeMeta(221)).toBe('2 min read');
  });

  it('never reports less than a minute', () => {
    expect(readingTimeMeta(0)).toBe('1 min read');
  });
});

describe('wordCount', () => {
  it('counts whitespace-separated words', () => {
    expect(wordCount('one two  three\nfour')).toBe(4);
  });

  it('is zero for blank input', () => {
    expect(wordCount('   \n ')).toBe(0);
  });
});
