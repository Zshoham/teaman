import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { guideLoader } from './lib/guide-loader.mjs';
import { referenceLoader } from './lib/reference-loader.mjs';
import { slidesLoader } from './lib/slides-loader.mjs';
import { globEntryId } from './lib/entry-identity.mjs';
import { FRONTMATTER_SCHEMAS } from './lib/frontmatter-schemas.mjs';
import {
  contentRoot,
  dailiesRoot,
  decisionsRoot,
  guidesRoot,
  notesRoot,
  slidesRoot,
} from './lib/content-paths';

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: notesRoot, generateId: globEntryId('note') }),
  schema: FRONTMATTER_SCHEMAS.note,
});

const references = defineCollection({
  // A SUMMARY.md directory is one logical entry assembled from its ordered
  // chapters; ordinary .md files remain one standalone reference apiece.
  loader: referenceLoader({ vaultDir: contentRoot }),
  schema: FRONTMATTER_SCHEMAS.reference,
});

// A guide's chapters. Its SUMMARY.md is the guide's index, below.
const guides = defineCollection({
  loader: glob({
    pattern: ['**/*.md', '!**/SUMMARY.md'],
    base: guidesRoot,
    generateId: globEntryId('guide'),
  }),
  schema: FRONTMATTER_SCHEMAS.guideChapter,
});

// One entry per published guide: its SUMMARY.md as the vault catalog reads it
// (title, tags, published chapters). Stored so a SUMMARY.md edit re-renders
// the guide pages in dev; the frontmatter itself is validated by the catalog
// with the guide-summary schema, and the loader refuses a guide that cannot
// build.
const guideIndexes = defineCollection({
  loader: guideLoader({ vaultDir: contentRoot }),
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()),
    chapters: z.array(z.object({ slug: z.string(), entryId: z.string(), title: z.string() })),
  }),
});

const slides = defineCollection({
  // Every deck outside `_` paths, parsed with Slidev's parser (see
  // discover-decks.mjs); drafts are stored and `getPublished` drops them, as
  // for the glob collections. The stored data is the headmatter plus what
  // discovery derived from it.
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
  guideIndexes,
  slides,
  dailies,
  decisions,
};
