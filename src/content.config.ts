import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { referenceLoader } from './lib/reference-loader.mjs';
import { slidesLoader } from './lib/slides-loader.mjs';
import { globEntryId } from './lib/entry-identity.mjs';
import { FRONTMATTER_SCHEMAS } from './lib/frontmatter-schemas.mjs';
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
  schema: FRONTMATTER_SCHEMAS.note,
});

const references = defineCollection({
  // A SUMMARY.md directory is one logical entry assembled from its ordered
  // chapters; ordinary .md files remain one standalone reference apiece.
  loader: referenceLoader({ base: referencesRoot }),
  schema: FRONTMATTER_SCHEMAS.reference,
});

const guides = defineCollection({
  loader: glob({
    pattern: ['**/*.md', '!**/SUMMARY.md'],
    base: guidesRoot,
    generateId: globEntryId('guide'),
  }),
  schema: FRONTMATTER_SCHEMAS.guideChapter,
});

const guideSummaries = defineCollection({
  loader: glob({
    pattern: '**/SUMMARY.md',
    base: guidesRoot,
    generateId: globEntryId('guide'),
  }),
  schema: FRONTMATTER_SCHEMAS.guideSummary,
});

const slides = defineCollection({
  // The deck catalog decides membership (no drafts, no `_` paths) and parses
  // each deck with Slidev's parser; see discover-decks.mjs. The stored data is
  // the headmatter plus what the catalog derived from it.
  loader: slidesLoader({ base: slidesRoot }),
  schema: FRONTMATTER_SCHEMAS.deck.extend({
    title: z.string(),
    tags: z.array(z.string()),
    slideCount: z.number().int().positive(),
  }),
});

const dailies = defineCollection({
  loader: glob({ pattern: '**/*.md', base: dailiesRoot, generateId: globEntryId('daily') }),
  schema: FRONTMATTER_SCHEMAS.daily,
});

const decisions = defineCollection({
  loader: glob({ pattern: '**/*.md', base: decisionsRoot, generateId: globEntryId('decision') }),
  schema: FRONTMATTER_SCHEMAS.decision,
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
