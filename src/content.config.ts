import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { referenceLoader } from './lib/reference-loader.mjs';
import { slidesLoader } from './lib/slides-loader.mjs';
import { globEntryId } from './lib/entry-identity.mjs';
import { ADR_STATUSES } from './lib/decision-records.mjs';
import {
  dailiesRoot,
  decisionsRoot,
  guidesRoot,
  notesRoot,
  referencesRoot,
  slidesRoot,
} from './lib/content-paths';

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: notesRoot, generateId: globEntryId('note') }),
  schema: z.object({
    title: z.string().optional(),
    tags: z.array(z.string()).optional(),
    date: z.coerce.date().optional(),
    draft: z.boolean().optional(),
  }),
});

const references = defineCollection({
  // A SUMMARY.md directory is one logical entry assembled from its ordered
  // chapters; ordinary .md files remain one standalone reference apiece.
  loader: referenceLoader({ base: referencesRoot }),
  schema: z.object({
    title: z.string().optional(),
    summary: z.string().optional(),
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
    generateId: globEntryId('guide'),
  }),
  schema: z.object({
    title: z.string().optional(),
  }),
});

const guideSummaries = defineCollection({
  loader: glob({
    pattern: '**/SUMMARY.md',
    base: guidesRoot,
    generateId: globEntryId('guide'),
  }),
  schema: z.object({
    title: z.string().optional(),
    // A guide is tagged once, on its SUMMARY.md — chapters inherit nothing, so
    // the guide travels through the index and filters as a single item.
    tags: tagList,
  }),
});

const slides = defineCollection({
  // The deck catalog decides membership (no drafts, no `_` paths) and parses
  // each deck with Slidev's parser; see discover-decks.mjs.
  loader: slidesLoader({ base: slidesRoot }),
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()),
    slideCount: z.number().int().positive(),
    draft: z.boolean().optional(),
  }).passthrough(),
});

const dailies = defineCollection({
  loader: glob({ pattern: '**/*.md', base: dailiesRoot, generateId: globEntryId('daily') }),
  schema: z.object({
    date: z.coerce.date(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().optional(),
  }),
});

const decisions = defineCollection({
  loader: glob({ pattern: '**/*.md', base: decisionsRoot, generateId: globEntryId('decision') }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    status: z.enum(ADR_STATUSES),
    tags: tagList,
    summary: z.string().optional(),
    supersedes: z.string().optional(),
    supersededBy: z.string().optional(),
  }),
});

export const collections = {
  notes,
  references,
  guides,
  guideSummaries,
  slides,
  dailies,
  decisions,
};
