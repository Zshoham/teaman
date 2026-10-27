/**
 * The frontmatter each kind of vault file may carry, as zod schemas. The
 * content collections (`content.config.ts`) validate with these at build time
 * and `teaman doctor` validates with the same ones beforehand, so a vault that
 * passes doctor cannot fail the build on frontmatter.
 *
 * One schema per *file kind*, not per collection: a guide's SUMMARY.md and its
 * chapters carry different frontmatter, and a reference book's SUMMARY.md
 * carries what a standalone reference does.
 *
 * Plain `.mjs` on `astro/zod` (the zod Astro ships) so the CLI can run them.
 */
import { z } from 'astro/zod';
import { ADR_STATUSES } from './decision-records.mjs';

/** `tags: [a, b]` or `tags: a, b` — both mean two tags. */
const tagList = z.preprocess(
  value => typeof value === 'string'
    ? value.split(',').map(tag => tag.trim()).filter(Boolean)
    : value,
  z.array(z.string()).optional(),
);

/** A date YAML may have parsed already or left as a string. */
const optionalDate = z.coerce.date({ error: 'not a valid date' }).optional();
const requiredDate = z.unknown()
  .refine(value => value !== undefined && value !== null && value !== '', 'required')
  .pipe(z.coerce.date({ error: 'not a valid date' }));

const draft = z.boolean().optional();

/**
 * An ADR a decision supersedes or is superseded by: its file name
 * (`adr-0002`, preferred) or its number as a string (`"0002"`). An unquoted
 * `0002` is a YAML number whose zero-padding is already gone, so it is
 * rejected rather than guessed at.
 */
const adrRef = z.string({
  error: issue => (typeof issue.input === 'number'
    ? `must name an ADR as a string — write adr-${String(issue.input).padStart(4, '0')} (or quote the number)`
    : 'must name an ADR, e.g. adr-0002'),
}).optional();

export const FRONTMATTER_SCHEMAS = {
  note: z.object({
    title: z.string().optional(),
    tags: tagList,
    date: optionalDate,
    draft,
  }),
  /** A standalone reference, or a reference book's SUMMARY.md. */
  reference: z.object({
    title: z.string().optional(),
    summary: z.string().optional(),
    tags: tagList,
    date: optionalDate,
    draft,
  }),
  /** A guide's SUMMARY.md: the guide's title and tags. */
  guideSummary: z.object({
    title: z.string().optional(),
    // A guide is tagged once, on its SUMMARY.md — chapters inherit nothing, so
    // the guide travels through the index and filters as a single item.
    tags: tagList,
    draft,
  }),
  guideChapter: z.object({
    title: z.string().optional(),
    draft,
  }),
  /** A Slidev deck's headmatter; Slidev's own keys pass through. */
  deck: z.object({
    title: z.string().optional(),
    tags: tagList,
    draft,
  }).passthrough(),
  daily: z.object({
    // The filename supplies the URL, not this: a daily is filed by `date`.
    date: requiredDate,
    tags: tagList,
    draft,
  }),
  decision: z.object({
    title: z.string({ error: 'required' }),
    date: requiredDate,
    status: z.enum(ADR_STATUSES, { error: `must be one of ${ADR_STATUSES.join(' | ')}` }),
    tags: tagList,
    summary: z.string().optional(),
    supersedes: adrRef,
    supersededBy: adrRef,
    draft,
  }),
};

/**
 * One file's frontmatter as the site sees it. Valid data comes back with the
 * schema's coercions applied (`tags: a, b` as a list, a quoted `date` as a
 * Date) over the keys the schema does not know, which pass through untouched
 * (`slug`, Slidev's own); invalid data comes back as written, with one line
 * per problem in `issues`, e.g. `status: must be one of accepted | proposed |
 * superseded`.
 *
 * @param {keyof typeof FRONTMATTER_SCHEMAS} kind
 * @param {Record<string, unknown> | null | undefined} data
 * @returns {{ data: Record<string, unknown>, issues: string[] }}
 */
export function normalizeFrontmatter(kind, data) {
  const raw = data ?? {};
  const result = FRONTMATTER_SCHEMAS[kind].safeParse(raw);
  if (result.success) return { data: { ...raw, ...result.data }, issues: [] };
  return {
    data: raw,
    issues: result.error.issues.map(issue => {
      const field = issue.path.join('.');
      return field ? `${field}: ${issue.message}` : issue.message;
    }),
  };
}

/**
 * Validate one file's frontmatter: `normalizeFrontmatter`'s `issues`.
 *
 * @param {keyof typeof FRONTMATTER_SCHEMAS} kind
 * @param {unknown} data
 * @returns {string[]}
 */
export function frontmatterProblems(kind, data) {
  return normalizeFrontmatter(kind, /** @type {Record<string, unknown>} */ (data)).issues;
}
