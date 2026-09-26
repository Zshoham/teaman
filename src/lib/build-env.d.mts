/** The engine checkout / installed package root. */
export const engineDir: string;

/** Vault root — the content the site is built from. */
export const vaultDir: string;

/** Where the built site is written. */
export const outDir: string;

/** Static assets handed to Astro as `publicDir`. */
export const publicDir: string;

/** Base URL path, normalized to a single leading + trailing slash. */
export const siteBase: string;

import type { SiteConfig } from './vault-config.mjs';

/** The vault's config merged over the engine defaults. */
export const siteConfig: SiteConfig;

/** The engine version stamped into built pages. */
export const engineVersion: string;
