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

/** The vault's `teaman.config.js` as serialized by the CLI, or `{}`. */
export const teamanConfig: Record<string, unknown>;
