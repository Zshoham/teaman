import { existsSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { enginePublicDir } from './vault-config.mjs';

/**
 * Where a Markdown image path written in a vault file (`![alt](diagram.svg)`,
 * `![alt](/images/x.png)`) points. The site, the reference PDF, and Confluence
 * sync all resolve image paths here, so one image is the same file — or
 * missing — in every renderer. (`![[embed]]`s are found by name instead; see
 * the vault index's `resolveAttachment`.)
 */

/**
 * The directories a path is looked up in after the file's own: the vault
 * root, then the public assets the site serves at its root — the CLI's
 * staged public dir when there is one, the vault's `public/`, and the
 * engine's `resources/public/`.
 *
 * @param {string} vaultDir
 * @param {{ engineDir: string, publicDir?: string }} options
 */
export function assetRoots(vaultDir, { engineDir, publicDir }) {
  return [...new Set([vaultDir, publicDir, join(vaultDir, 'public'), enginePublicDir(engineDir)].filter(Boolean))];
}

/** Is `url` a reference to something other than a local file? */
export function isRemoteUrl(url) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url);
}

/**
 * The path `url` names, without its `?query`/`#fragment` and percent-decoded.
 *
 * @param {string} url
 */
export function assetPath(url) {
  const path = url.split(/[?#]/, 1)[0];
  try { return decodeURIComponent(path); } catch { return path; }
}

/**
 * The file an image path names, first hit wins: a relative path against the
 * file's own directory, then (relative or site-root `/x`) each of `roots`.
 * Null for a remote URL, a bare fragment, or a path no file matches.
 *
 * @param {string} url  as written in the Markdown
 * @param {object} options
 * @param {string} [options.fromFile]  the file it is written in (absolute)
 * @param {string[]} options.roots  `assetRoots`
 * @returns {string | null}  absolute
 */
export function resolveVaultAsset(url, { fromFile, roots }) {
  if (!url || isRemoteUrl(url)) return null;
  const path = assetPath(url);
  const rel = path.replace(/^\/+/, '');
  if (!rel) return null;
  const candidates = [
    ...(fromFile && !path.startsWith('/') ? [resolve(dirname(fromFile), path)] : []),
    ...roots.map(root => join(root, rel)),
  ];
  return candidates.find(candidate => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}
