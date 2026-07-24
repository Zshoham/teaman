/** Parses Jira / Confluence / GitLab URLs into the ref that a "smart link" chip
 *  displays (see `remark-smart-links.mjs` for the rendering half).
 *
 *  Everything here is derived from the href alone — no API calls, no build-time
 *  network — which is what makes the feature safe in a static build. The parse
 *  yields two display forms:
 *
 *    - `ref`     — the short sigil, used when the link has its own label
 *                  (`!284`, `#77`, `@a1b2c3d`, `PLAT-412`, `ENG`)
 *    - `fullRef` — the self-contained form, used when the link has no label and
 *                  the ref has to carry the context itself (`platform/api!284`)
 *
 *  Confluence additionally recovers a human page title from the URL slug, which
 *  is why a bare Confluence link can still render a label.
 */

/** Hosts recognised without any vault config. A vault's `config.smartLinks`
 *  extends (never replaces) these — see `resolveHosts`. `*.` matches any
 *  subdomain, so every Atlassian Cloud tenant is covered by one pattern; the
 *  two Atlassian services share a host and are told apart by their paths. */
export const DEFAULT_SMART_LINK_HOSTS = Object.freeze({
  jira: Object.freeze(['*.atlassian.net']),
  confluence: Object.freeze(['*.atlassian.net']),
  gitlab: Object.freeze(['gitlab.com']),
});

export const SMART_LINK_SERVICES = Object.freeze(['jira', 'confluence', 'gitlab']);

/**
 * Merge a vault's host overrides over the defaults. Vault entries are additive:
 * a self-hosted `gitlab.acme.io` joins `gitlab.com` rather than displacing it,
 * so a vault that links to both keeps working.
 *
 * @param {Partial<Record<string, readonly string[]>>} [overrides]
 * @returns {Record<string, string[]>}
 */
export function resolveHosts(overrides) {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const service of SMART_LINK_SERVICES) {
    const extra = overrides?.[service];
    out[service] = [
      ...DEFAULT_SMART_LINK_HOSTS[service],
      ...(Array.isArray(extra) ? extra : []),
    ]
      .map((h) => normalizeHostPattern(h))
      .filter((h, i, all) => h && all.indexOf(h) === i);
  }
  return out;
}

/** Accepts `gitlab.acme.io`, `https://gitlab.acme.io`, `gitlab.acme.io/` and
 *  `*.atlassian.net` alike — a vault author shouldn't have to guess the form. */
function normalizeHostPattern(pattern) {
  return String(pattern ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

function hostMatches(hostname, pattern) {
  if (!pattern) return false;
  if (pattern.startsWith('*.')) return hostname.endsWith(pattern.slice(1));
  return hostname === pattern;
}

/** `Cache+Invalidation+Strategy` → `Cache Invalidation Strategy`. The `+` has to
 *  become a space *before* percent-decoding, or an encoded literal plus (`%2B`)
 *  would be turned into a space too. */
function decodeSlug(slug) {
  try {
    return decodeURIComponent(String(slug).replace(/\+/g, ' ')).trim();
  } catch {
    return String(slug).replace(/\+/g, ' ').trim();
  }
}

function segments(pathname) {
  return pathname.split('/').filter(Boolean);
}

const JIRA_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;

function parseJira(url) {
  const parts = segments(url.pathname);

  // `/browse/PLAT-412` — the canonical issue permalink.
  const browseAt = parts.indexOf('browse');
  if (browseAt !== -1 && JIRA_KEY.test(parts[browseAt + 1] ?? '')) {
    return { kind: 'issue', ref: parts[browseAt + 1] };
  }

  // Board / backlog URLs carry the issue in a query param instead.
  const selected = url.searchParams.get('selectedIssue');
  if (selected && JIRA_KEY.test(selected)) {
    return { kind: 'issue', ref: selected };
  }

  // Anything else that contains a bare issue key (`/jira/software/projects/…`).
  const key = parts.find((p) => JIRA_KEY.test(p));
  if (key) return { kind: 'issue', ref: key };

  return null;
}

function parseConfluence(url) {
  const parts = segments(url.pathname);

  // Cloud: /wiki/spaces/ENG/pages/884736/Cache+Invalidation+Strategy
  // (also matches the /spaces/… form some tenants serve without the /wiki prefix)
  const spacesAt = parts.indexOf('spaces');
  if (spacesAt !== -1 && parts[spacesAt + 1]) {
    const space = parts[spacesAt + 1];
    const pagesAt = parts.indexOf('pages', spacesAt);
    // The slug sits after `pages/<id>`; some URLs stop at the id.
    const slug = pagesAt !== -1 ? parts[pagesAt + 2] : undefined;
    return {
      kind: 'page',
      ref: space,
      title: slug ? decodeSlug(slug) : undefined,
    };
  }

  // Server / Data Center: /display/ENG/Cache+Invalidation+Strategy
  const displayAt = parts.indexOf('display');
  if (displayAt !== -1 && parts[displayAt + 1]) {
    return {
      kind: 'page',
      ref: parts[displayAt + 1],
      title: parts[displayAt + 2] ? decodeSlug(parts[displayAt + 2]) : undefined,
    };
  }

  return null;
}

/** Deep file paths would produce a chip wider than the reading column, and the
 *  chip can't wrap — so keep the project, elide the middle, keep the filename. */
function shortenPath(projectBase, filePath) {
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length <= 2) return [projectBase, ...parts].join('/');
  return `${projectBase}/…/${parts[parts.length - 1]}`;
}

function parseGitlab(url) {
  const path = url.pathname.replace(/\/+$/, '');

  // Every GitLab resource route is `<project path>/-/<resource>/…`; the `/-/`
  // separator is what makes an arbitrarily deep group nesting unambiguous.
  const splitAt = path.indexOf('/-/');
  if (splitAt === -1) {
    const parts = segments(path);
    if (parts.length < 2) return null;
    const project = parts.join('/');
    return { kind: 'project', ref: project, fullRef: project };
  }

  const project = segments(path.slice(0, splitAt)).join('/');
  if (!project) return null;
  const projectBase = project.slice(project.lastIndexOf('/') + 1);
  const rest = segments(path.slice(splitAt + 3));
  const [resource, ...tail] = rest;

  if (resource === 'merge_requests' && /^\d+$/.test(tail[0] ?? '')) {
    return { kind: 'merge_request', ref: `!${tail[0]}`, fullRef: `${project}!${tail[0]}` };
  }
  if (resource === 'issues' && /^\d+$/.test(tail[0] ?? '')) {
    return { kind: 'issue', ref: `#${tail[0]}`, fullRef: `${project}#${tail[0]}` };
  }
  if (resource === 'commit' && /^[0-9a-f]{7,40}$/i.test(tail[0] ?? '')) {
    const sha = tail[0].slice(0, 7);
    return { kind: 'commit', ref: `@${sha}`, fullRef: `${project}@${sha}` };
  }
  if ((resource === 'blob' || resource === 'tree') && tail.length > 1) {
    // tail[0] is the git ref (branch/tag/sha); the rest is the path in the repo.
    const filePath = tail.slice(1).map(decodeSlug).join('/');
    const name = filePath.slice(filePath.lastIndexOf('/') + 1);
    return {
      kind: resource === 'blob' ? 'file' : 'directory',
      ref: name,
      fullRef: shortenPath(projectBase, filePath),
    };
  }

  return { kind: 'project', ref: project, fullRef: project };
}

const PARSERS = { jira: parseJira, confluence: parseConfluence, gitlab: parseGitlab };

/**
 * Identify a smart link from its href.
 *
 * @param {string} href
 * @param {Record<string, readonly string[]>} [hosts] resolved host map
 *   (`resolveHosts` output). Defaults to the built-in hosts.
 * @returns {{service: string, kind: string, ref: string, fullRef: string,
 *            title?: string, host: string} | null} null when the URL isn't a
 *   recognised service, isn't absolute, or is a service host whose path carries
 *   no ref (a Jira dashboard, a Confluence space home) — in which case the link
 *   is left as ordinary prose rather than rendered as an uninformative chip.
 */
export function parseSmartLink(href, hosts = DEFAULT_SMART_LINK_HOSTS) {
  let url;
  try {
    url = new URL(String(href));
  } catch {
    return null; // relative / wiki / mailto links are not smart links
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const hostname = url.hostname.toLowerCase();

  // Atlassian Cloud serves Jira and Confluence from one host, so a host match
  // only nominates candidates — the first parser to find a ref in the path wins.
  for (const service of SMART_LINK_SERVICES) {
    const patterns = hosts?.[service] ?? [];
    if (!patterns.some((p) => hostMatches(hostname, normalizeHostPattern(p)))) continue;
    const parsed = PARSERS[service](url);
    if (parsed) {
      return {
        service,
        kind: parsed.kind,
        ref: parsed.ref,
        fullRef: parsed.fullRef ?? parsed.ref,
        ...(parsed.title ? { title: parsed.title } : {}),
        host: hostname,
      };
    }
  }

  return null;
}
