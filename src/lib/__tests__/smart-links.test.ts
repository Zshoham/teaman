import { describe, it, expect } from 'vitest';
import {
  parseSmartLink,
  resolveHosts,
  DEFAULT_SMART_LINK_HOSTS,
} from '../smart-links.mjs';

const parse = (url: string, hosts?: unknown) =>
  parseSmartLink(url, hosts as never) as any;

describe('resolveHosts', () => {
  it('returns the built-in hosts when a vault configures nothing', () => {
    expect(resolveHosts(undefined)).toEqual({
      jira: ['*.atlassian.net'],
      confluence: ['*.atlassian.net'],
      gitlab: ['gitlab.com'],
    });
  });

  it('extends rather than replaces the defaults', () => {
    const hosts = resolveHosts({ gitlab: ['gitlab.acme.io'] });
    expect(hosts.gitlab).toEqual(['gitlab.com', 'gitlab.acme.io']);
    expect(hosts.jira).toEqual(['*.atlassian.net']);
  });

  it('normalizes schemes, paths, ports and case, and de-duplicates', () => {
    const hosts = resolveHosts({
      gitlab: ['https://GitLab.acme.io/', 'gitlab.acme.io:8443', 'gitlab.com'],
    });
    expect(hosts.gitlab).toEqual(['gitlab.com', 'gitlab.acme.io']);
  });

  it('ignores a non-array override', () => {
    expect(resolveHosts({ gitlab: 'gitlab.acme.io' } as never).gitlab).toEqual(['gitlab.com']);
  });
});

describe('parseSmartLink — non-matches', () => {
  it.each([
    ['a relative link', '/notes/some-note/'],
    ['a wiki-link href', 'notes/some-note/'],
    ['a mailto', 'mailto:someone@acme.io'],
    ['an unrelated host', 'https://example.com/browse/PLAT-412'],
    ['a non-http protocol on a known host', 'ftp://gitlab.com/platform/api'],
  ])('returns null for %s', (_label, url) => {
    expect(parse(url)).toBeNull();
  });

  it('returns null for a service host with no ref in the path', () => {
    expect(parse('https://acme.atlassian.net/')).toBeNull();
    expect(parse('https://acme.atlassian.net/jira/dashboards/last-visited')).toBeNull();
  });

  it('returns null for a gitlab host without a project path', () => {
    expect(parse('https://gitlab.com/')).toBeNull();
    expect(parse('https://gitlab.com/explore')).toBeNull();
  });
});

describe('parseSmartLink — jira', () => {
  it('parses a /browse/ permalink on any cloud tenant', () => {
    expect(parse('https://acme.atlassian.net/browse/PLAT-412')).toMatchObject({
      service: 'jira',
      kind: 'issue',
      ref: 'PLAT-412',
      fullRef: 'PLAT-412',
      host: 'acme.atlassian.net',
    });
  });

  it('parses the issue out of a board URL query param', () => {
    expect(
      parse('https://acme.atlassian.net/jira/software/projects/PLAT/boards/3?selectedIssue=PLAT-88'),
    ).toMatchObject({ service: 'jira', ref: 'PLAT-88' });
  });

  it('finds a bare issue key elsewhere in the path', () => {
    expect(parse('https://acme.atlassian.net/jira/core/projects/OPS/issues/OPS-7')).toMatchObject({
      service: 'jira',
      ref: 'OPS-7',
    });
  });

  it('ignores a lowercase pseudo-key', () => {
    expect(parse('https://acme.atlassian.net/browse/plat-412')).toBeNull();
  });

  it('parses a self-hosted Data Center host when configured', () => {
    const hosts = resolveHosts({ jira: ['jira.acme.io'] });
    expect(parse('https://jira.acme.io/browse/PLAT-412', hosts)).toMatchObject({
      service: 'jira',
      ref: 'PLAT-412',
      host: 'jira.acme.io',
    });
  });
});

describe('parseSmartLink — confluence', () => {
  it('parses space + title from a cloud page URL', () => {
    expect(
      parse('https://acme.atlassian.net/wiki/spaces/ENG/pages/884736/Cache+Invalidation+Strategy'),
    ).toMatchObject({
      service: 'confluence',
      kind: 'page',
      ref: 'ENG',
      fullRef: 'ENG',
      title: 'Cache Invalidation Strategy',
    });
  });

  it('parses a page URL that stops at the page id', () => {
    const parsed = parse('https://acme.atlassian.net/wiki/spaces/ENG/pages/884736');
    expect(parsed).toMatchObject({ service: 'confluence', ref: 'ENG' });
    expect(parsed.title).toBeUndefined();
  });

  it('parses the Server/DC /display/ form', () => {
    expect(parse('https://wiki.acme.io/display/SRE/2026-07-02+Postmortem', resolveHosts({
      confluence: ['wiki.acme.io'],
    }))).toMatchObject({ ref: 'SRE', title: '2026-07-02 Postmortem' });
  });

  it('percent-decodes the title without eating an encoded plus', () => {
    expect(
      parse('https://acme.atlassian.net/wiki/spaces/ENG/pages/1/Go%2FNo-Go+%26+C%2B%2B'),
    ).toMatchObject({ title: 'Go/No-Go & C++' });
  });

  it('does not claim a jira issue URL on the shared atlassian host', () => {
    expect(parse('https://acme.atlassian.net/browse/PLAT-412').service).toBe('jira');
  });
});

describe('parseSmartLink — gitlab', () => {
  it('parses a merge request', () => {
    expect(parse('https://gitlab.com/platform/api/-/merge_requests/284')).toMatchObject({
      service: 'gitlab',
      kind: 'merge_request',
      ref: '!284',
      fullRef: 'platform/api!284',
    });
  });

  it('parses an issue', () => {
    expect(parse('https://gitlab.com/platform/api/-/issues/77')).toMatchObject({
      kind: 'issue',
      ref: '#77',
      fullRef: 'platform/api#77',
    });
  });

  it('shortens a commit sha to seven characters', () => {
    expect(
      parse('https://gitlab.com/platform/api/-/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'),
    ).toMatchObject({ kind: 'commit', ref: '@a1b2c3d', fullRef: 'platform/api@a1b2c3d' });
  });

  it('parses a file in a repo, keeping the project and filename', () => {
    expect(parse('https://gitlab.com/platform/api/-/blob/main/src/cache.ts')).toMatchObject({
      kind: 'file',
      ref: 'cache.ts',
      fullRef: 'api/src/cache.ts',
    });
  });

  it('elides the middle of a deep file path so the chip stays narrow', () => {
    expect(
      parse('https://gitlab.com/platform/api/-/blob/main/src/server/cache/invalidate.ts'),
    ).toMatchObject({ ref: 'invalidate.ts', fullRef: 'api/…/invalidate.ts' });
  });

  it('handles nested groups', () => {
    expect(parse('https://gitlab.com/acme/platform/api/-/merge_requests/1')).toMatchObject({
      ref: '!1',
      fullRef: 'acme/platform/api!1',
    });
  });

  it('falls back to the project for an unrecognised resource route', () => {
    expect(parse('https://gitlab.com/platform/api/-/pipelines/9931')).toMatchObject({
      kind: 'project',
      ref: 'platform/api',
      fullRef: 'platform/api',
    });
  });

  it('parses a bare project URL', () => {
    expect(parse('https://gitlab.com/platform/api')).toMatchObject({
      kind: 'project',
      ref: 'platform/api',
    });
  });

  it('parses a self-hosted instance when configured', () => {
    const hosts = resolveHosts({ gitlab: ['gitlab.acme.io'] });
    expect(parse('https://gitlab.acme.io/platform/api/-/issues/77', hosts)).toMatchObject({
      service: 'gitlab',
      ref: '#77',
      host: 'gitlab.acme.io',
    });
  });

  it('ignores a trailing slash and a fragment', () => {
    expect(parse('https://gitlab.com/platform/api/-/merge_requests/284/#note_1')).toMatchObject({
      ref: '!284',
    });
  });
});

describe('DEFAULT_SMART_LINK_HOSTS', () => {
  it('is frozen so a caller cannot mutate the shared defaults', () => {
    expect(Object.isFrozen(DEFAULT_SMART_LINK_HOSTS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SMART_LINK_HOSTS.gitlab)).toBe(true);
  });
});
