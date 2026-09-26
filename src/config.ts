// Site identity, theme & landing-page copy, as the site reads it.
//
// The config's shape, defaults, merge, and validation live in
// `src/lib/vault-config.mjs` — one copy shared with the Markdown pipeline, the
// build scripts, and `teaman doctor`. The CLI serializes the vault's
// `teaman.config.js` into `TEAMAN_CONFIG`; `build-env.mjs` merges it over the
// defaults (or uses the defaults alone under plain `npm run dev` and the tests).

import { siteConfig } from './lib/build-env.mjs';
import type { SiteConfig } from './lib/vault-config.mjs';

export type { QuickLink, SiteConfig } from './lib/vault-config.mjs';
export { DEFAULT_CONFIG } from './lib/vault-config.mjs';

export const SITE_CONFIG: SiteConfig = siteConfig;
