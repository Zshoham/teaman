/**
 * The vault's `teaman.config.js`: what it may contain, what the engine fills
 * in when it doesn't, and how it is checked. The one copy — the site
 * (`src/config.ts`), the Markdown pipeline (`astro.config.mjs`), the build
 * scripts, and `teaman doctor` all read the config through here, and all see
 * the same merged shape (via `siteConfig` in `build-env.mjs`).
 *
 * The config is pure data (no functions), so it round-trips through the
 * `TEAMAN_CONFIG` env var as JSON. Plain `.mjs` on `astro/zod` so the CLI can
 * run it; `SiteConfig` is inferred from the schema below.
 */
import { existsSync } from 'fs';
import { isAbsolute, join } from 'path';
import { z } from 'astro/zod';

const required = { error: 'required' };

/**
 * One tile in the home-page quick-links bento grid.
 *
 * - `label` — the link text.
 * - `url` — the destination. External (`https://…`) opens in a new tab;
 *   relative paths render as same-tab in-site links.
 * - `description` — optional one-line muted caption. A tile with a description
 *   gets more grid space *and* a louder treatment than one without (see
 *   `src/lib/bento.ts`).
 * - `icon` — optional. A name from the engine's curated lucide-style set
 *   (`github`, `book`, `globe`, `link`, `file`, `code`, `rocket`, `lightbulb`,
 *   `rss`, `mail`, `coffee`, `arrow-up-right`) renders as a themed inline SVG.
 *   Any other string renders verbatim, so an emoji or short glyph works too.
 *   Defaults to `link`.
 *
 * Tile sizes and treatments are not configurable — the engine computes the
 * bento layout from each tile's content and the total link count, and the grid
 * always fills exactly. Links with no description get no tile at all — they
 * render as a strip of compact chips below the grid.
 */
const quickLinkSchema = z.object({
  label: z.string(required).min(1, 'required'),
  url: z.string(required).min(1, 'required'),
  description: z.string().optional(),
  icon: z.string().optional(),
});

const heroSchema = z.object({
  eyebrow: z.string(),
  /** HTML allowed. Wrap muted-italic phrases in `<em>`; line breaks via `<br>`. */
  title: z.string(required),
  /** HTML allowed. */
  description: z.string(),
});

const hostList = z.array(z.string().trim().min(1, 'must be a non-empty hostname')).optional();

/** The complete site config: a vault's config merged over `DEFAULT_CONFIG`. */
export const siteConfigSchema = z.object({
  /** Short brand mark shown in the header (mono). Also used in the document title. */
  brand: z.string(required).min(1, 'required'),
  /** Tagline shown after the brand. Also used in the document title (`brand — tagline`). */
  tagline: z.string(),
  /**
   * Optional logo shown at the top-left of the header: a file in the vault
   * (`resolveLogoFile`), served from the site root. Single-colour SVGs work
   * best — it is rendered as a CSS mask so it follows the text colour. `null`
   * falls back to the small accent square.
   */
  logo: z.string().nullable().optional(),
  /**
   * @deprecated No longer rendered; the home page starts at the filterable
   * feed. Kept for backwards compatibility and still validated; slated for
   * removal in a future major. New vaults may omit it.
   */
  hero: heroSchema,
  /** @deprecated No longer rendered. Slated for removal in a future major. */
  footerNote: z.string().optional(),
  /** Quick-link tiles rendered as a bento grid above the home feed. */
  links: z.array(quickLinkSchema).optional(),
  /**
   * Extra hostnames that render as smart-link chips (Jira issues, Confluence
   * pages, GitLab MRs/issues/commits/files). Atlassian Cloud and gitlab.com are
   * built in; entries **extend** them, for self-hosted instances. A bare
   * hostname is enough; a scheme or `*.` wildcard is also accepted.
   */
  smartLinks: z.object({ jira: hostList, confluence: hostList, gitlab: hostList }).optional(),
  /**
   * Semver range of the engine this vault targets (e.g. `"^1.4"`). Read only
   * by the CLI, which warns when the running engine falls outside it.
   */
  engine: z.string().optional(),
  /** Default `--base` for the CLI (a sub-path deploy). Read only by the CLI. */
  base: z.string().optional(),
  /**
   * Per-vault theme overrides: CSS custom properties applied to `:root` (the
   * token names in `src/styles/global.css`; the leading `--` is optional).
   * This is the entire per-vault styling surface.
   */
  theme: z.record(z.string(), z.string()).optional(),
  /** Project-wide knobs for every Slidev deck. All optional. */
  slides: z.object({
    /** Bottom-right logo on every slide, found like `logo`. Omit/`null` for none. */
    logo: z.string().nullable().optional(),
    /** Primary accent (headings rule, links, list markers). Any CSS colour. */
    primary: z.string().optional(),
    /** Secondary accent (blockquote rule). Any CSS colour. */
    secondary: z.string().optional(),
    /** Show the footer logo on every slide. Defaults to `true`. */
    footer: z.boolean().optional(),
  }).optional(),
});

/** @typedef {z.infer<typeof siteConfigSchema>} SiteConfig */
/** @typedef {z.infer<typeof quickLinkSchema>} QuickLink */

/**
 * What a vault's config file may say: every key optional except `brand`, and
 * a `hero`, when present, needs its `title` (the rest falls back).
 */
export const vaultConfigSchema = siteConfigSchema.partial().extend({
  brand: siteConfigSchema.shape.brand,
  hero: heroSchema.partial().extend({ title: heroSchema.shape.title }).optional(),
});

/** @type {SiteConfig} */
export const DEFAULT_CONFIG = {
  brand: 'vault.teaman',
  tagline: 'a working garden',
  logo: 'teacup.svg',
  hero: {
    eyebrow: 'an open notebook · est. 2026',
    title: 'Notes, guides and slides<br/><em>pulled, in public,</em> from a working vault.',
    description:
      'This is a thin window onto an Obsidian vault — the bits worth showing. ' +
      'Some entries are evergreen, some are still growing, and a few are deliberately ' +
      'wrong on purpose. Edits are silent.',
  },
  links: [
    {
      label: 'Obsidian',
      url: 'https://obsidian.md',
      description:
        'The local-first markdown app this vault lives in. Links are first-class, ' +
        'everything is a plain text file, and the graph is yours to shape.',
      icon: 'book',
    },
    {
      label: '@zshoham/teaman',
      url: 'https://www.npmjs.com/package/@zshoham/teaman',
      description: 'The engine that builds this site.',
      icon: 'rocket',
    },
    { label: 'Astro', url: 'https://astro.build', description: 'The web framework underneath.', icon: 'code' },
    { label: 'lucide', url: 'https://lucide.dev', icon: 'lightbulb' },
    { label: 'changelog', url: 'https://github.com/obsidianmd/obsidian-release/releases', icon: 'rss' },
    { label: 'docs', url: 'https://docs.obsidian.md', description: 'API & plugin reference.', icon: 'file' },
    { label: 'forum', url: 'https://forum.obsidian.md', icon: 'globe' },
    { label: 'made slowly', url: 'https://slowdown.xyz', icon: 'coffee' },
  ],
};

/**
 * A vault's (possibly partial) config over the defaults. `hero` merges one
 * level deep so a vault can override just its title.
 *
 * @param {Partial<SiteConfig>} [config]
 * @returns {SiteConfig}
 */
export function mergeConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    hero: { ...DEFAULT_CONFIG.hero, ...(config.hero ?? {}) },
  };
}

/** `links.0.label` → `links[0].label` */
function fieldPath(path) {
  return path.reduce((out, key) => (typeof key === 'number' ? `${out}[${key}]` : out ? `${out}.${key}` : String(key)), '');
}

function unwrap(schema) {
  let current = schema;
  while (current instanceof z.ZodOptional || current instanceof z.ZodNullable) current = current.unwrap();
  return current;
}

/** Keys in `value` that `schema` does not define, as field paths. */
function unknownKeys(schema, value, path = []) {
  const shape = unwrap(schema);
  if (shape instanceof z.ZodArray && Array.isArray(value)) {
    return value.flatMap((item, index) => unknownKeys(shape.element, item, [...path, index]));
  }
  if (!(shape instanceof z.ZodObject) || !value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => (key in shape.shape
    ? unknownKeys(shape.shape[key], child, [...path, key])
    : [fieldPath([...path, key])]));
}

/**
 * Check a vault's config. Problems are what the schema rejects; warnings are
 * keys the engine doesn't know (probably a typo), values that look wrong, and
 * theme tokens `global.css` doesn't define.
 *
 * @param {unknown} config
 * @param {{ themeTokens?: Set<string> | null }} [options]  known `--tokens`,
 *   or null to skip the theme check
 * @returns {{ problems: string[], warnings: string[] }}
 */
export function checkVaultConfig(config, { themeTokens = null } = {}) {
  const result = vaultConfigSchema.safeParse(config ?? {});
  const problems = result.success ? [] : result.error.issues.map(issue => {
    const field = fieldPath(issue.path);
    return `config: ${field ? `${field}: ` : ''}${issue.message}`;
  });
  const warnings = unknownKeys(vaultConfigSchema, config).map(key => `config: unknown key "${key}"`);

  (Array.isArray(config?.links) ? config.links : []).forEach((link, index) => {
    if (typeof link?.url === 'string' && link.url && !/^(https?:\/\/|\/|#)/i.test(link.url)) {
      warnings.push(`config: links[${index}].url "${link.url}" doesn't look like a URL`);
    }
  });
  for (const [service, hosts] of Object.entries(config?.smartLinks ?? {})) {
    if (!Array.isArray(hosts)) continue;
    hosts.forEach((host, index) => {
      const bare = typeof host === 'string' ? host.trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '') : '';
      if (bare && !/^(\*\.)?[a-z0-9.-]+$/i.test(bare)) {
        warnings.push(`config: smartLinks.${service}[${index}] "${host}" doesn't look like a hostname`);
      }
    });
  }
  if (themeTokens && config?.theme && typeof config.theme === 'object') {
    for (const token of Object.keys(config.theme)) {
      if (!themeTokens.has(themeTokenName(token))) warnings.push(`theme: unknown token "${token}"`);
    }
  }
  return { problems, warnings };
}

/** A theme key as the CSS custom property it sets (`primary` → `--primary`). */
export function themeTokenName(key) {
  return key.startsWith('--') ? key : `--${key}`;
}

/**
 * The file a configured logo (`logo`, `slides.logo`) names: an absolute path,
 * else relative to the vault root, then the vault's `public/`, then the
 * engine's bundled `resources/` (where the default `teacup.svg` lives). Null
 * when none exists.
 *
 * @param {string | null | undefined} logo
 * @param {{ vaultDir: string, engineDir: string, exists?: (path: string) => boolean }} dirs
 */
export function resolveLogoFile(logo, { vaultDir, engineDir, exists = existsSync }) {
  if (!logo) return null;
  if (isAbsolute(logo)) return exists(logo) ? logo : null;
  return [join(vaultDir, logo), join(vaultDir, 'public', logo), join(engineDir, 'resources', logo)]
    .find(path => exists(path)) ?? null;
}
