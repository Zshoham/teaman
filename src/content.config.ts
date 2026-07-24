import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { dailiesRoot, decisionsRoot, guidesRoot, notesRoot, slidesRoot } from './lib/content-paths';

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: notesRoot }),
  schema: z.object({
    title: z.string().optional(),
    tags: z.array(z.string()).optional(),
    date: z.coerce.date().optional(),
    draft: z.boolean().optional(),
  }),
});

const tagList = z.preprocess(
  value => typeof value === 'string'
    ? value.split(',').map(tag => tag.trim()).filter(Boolean)
    : value,
  z.array(z.string()).optional(),
);

const guides = defineCollection({
  loader: glob({
    pattern: ['**/*.md', '!**/SUMMARY.md'],
    base: guidesRoot,
  }),
  schema: z.object({
    title: z.string().optional(),
  }),
});

const guideSummaries = defineCollection({
  loader: glob({
    pattern: '**/SUMMARY.md',
    base: guidesRoot,
  }),
  schema: z.object({
    title: z.string().optional(),
    // A guide is tagged once, on its SUMMARY.md — chapters inherit nothing, so
    // the guide travels through the index and filters as a single item.
    tags: tagList,
  }),
});

const slides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: slidesRoot }),
  schema: z.object({
    title: z.string().optional(),
    tags: tagList,
    draft: z.boolean().optional(),
  }).passthrough(),
});

const dailies = defineCollection({
  loader: glob({ pattern: '**/*.md', base: dailiesRoot }),
  schema: z.object({
    date: z.coerce.date(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().optional(),
  }),
});

const decisions = defineCollection({
  loader: glob({ pattern: '**/*.md', base: decisionsRoot }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    status: z.enum(['accepted', 'proposed', 'superseded']),
    tags: tagList,
    summary: z.string().optional(),
    supersedes: z.string().optional(),
    supersededBy: z.string().optional(),
  }),
});

export const collections = { notes, guides, guideSummaries, slides, dailies, decisions };
