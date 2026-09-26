import { describe, expect, it } from 'vitest';
import { FRONTMATTER_SCHEMAS, frontmatterProblems } from '../frontmatter-schemas.mjs';

describe('frontmatter schemas', () => {
  it('accepts tags as a list or a comma-separated string on every kind', () => {
    for (const kind of ['note', 'reference', 'guideSummary', 'deck', 'daily', 'decision']) {
      const data = { tags: 'a, b', date: '2026-01-01', title: 'T', status: 'accepted' };
      expect(FRONTMATTER_SCHEMAS[kind].parse(data).tags, kind).toEqual(['a', 'b']);
    }
  });

  it('requires a daily date and says when one is malformed', () => {
    expect(frontmatterProblems('daily', {})).toEqual(['date: required']);
    expect(frontmatterProblems('daily', { date: 'someday' })).toEqual(['date: not a valid date']);
    expect(FRONTMATTER_SCHEMAS.daily.parse({ date: '2026-03-12' }).date).toEqual(new Date('2026-03-12'));
  });

  it('names ADR lineage by file name or quoted number, never a bare number', () => {
    const base = { title: 'T', date: '2026-01-01', status: 'accepted' };
    expect(frontmatterProblems('decision', { ...base, supersedes: 'adr-0002' })).toEqual([]);
    expect(frontmatterProblems('decision', { ...base, supersedes: '0002' })).toEqual([]);
    expect(frontmatterProblems('decision', { ...base, supersedes: 2 })).toEqual([
      'supersedes: must name an ADR as a string — write adr-0002 (or quote the number)',
    ]);
  });

  it('lets Slidev headmatter keys through on decks', () => {
    expect(FRONTMATTER_SCHEMAS.deck.parse({ theme: 'x', layout: 'cover' })).toEqual({ theme: 'x', layout: 'cover' });
  });
});
