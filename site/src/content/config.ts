import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: '../content/notes' }),
  schema: z.object({
    title: z.string().optional(),
    tags: z.array(z.string()).optional(),
    date: z.coerce.date().optional(),
    draft: z.boolean().optional(),
  }),
});

export const collections = { notes };
