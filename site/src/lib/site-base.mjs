/**
 * Normalize a site base path the same way Astro normalizes `BASE_URL`:
 * guarantee a single leading and trailing slash. The build scripts compose
 * URLs as `${base}slides/...`, so an un-normalized input like `/foo` would
 * otherwise yield `/fooslides/...` instead of `/foo/slides/...`.
 */
export function normalizeBase(raw) {
  let base = (raw ?? '/').trim();
  if (base === '' || base === '/') return '/';
  if (!base.startsWith('/')) base = `/${base}`;
  if (!base.endsWith('/')) base = `${base}/`;
  return base;
}
