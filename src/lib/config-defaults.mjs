/**
 * Config defaults that the build scripts need too. The scripts run as plain
 * Node and cannot import `src/config.ts`, so anything they read from
 * `TEAMAN_CONFIG` — which the CLI fills with the vault's *partial* config,
 * merging happens in `src/config.ts` — has to fall back to the same value the
 * site would show, not a second guess at it.
 */
export const DEFAULT_BRAND = 'vault.teaman';
