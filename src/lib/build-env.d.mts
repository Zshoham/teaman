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

/** Where the slides build stages decks for Slidev. */
export const slidesWorkDir: string;

export interface BuildEnvSettings {
  vaultDir: string;
  config: object;
  version?: string;
  outDir?: string;
  siteBase?: string;
  publicDir?: string;
  slidesWorkDir?: string;
}

export interface BuildEnv {
  vaultDir: string;
  outDir: string;
  publicDir: string;
  siteBase: string;
  siteConfig: SiteConfig;
  engineVersion: string;
  slidesWorkDir: string;
}

/** What a build stage is told, as env vars. */
export function encodeBuildEnv(settings: BuildEnvSettings): Record<string, string>;

/** Read the seam from `env`, with the engine's fallbacks. */
export function decodeBuildEnv(env: Record<string, string | undefined>, engine?: string): BuildEnv;
