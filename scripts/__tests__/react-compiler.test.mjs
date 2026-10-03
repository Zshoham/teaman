import { readFileSync } from 'node:fs';
import { transformSync } from 'oxc-transform-react';
import { describe, expect, it } from 'vitest';

describe('React compiler rollout', () => {
  for (const component of [
    'collection/EntryFilterBar.tsx',
    'decisions/AdrTimeline.tsx',
  ]) {
    it(`optimizes ${component} without falling back`, () => {
      const file = new URL(`../../src/components/${component}`, import.meta.url);
      const result = transformSync(file.pathname, readFileSync(file, 'utf8'), {
        reactCompiler: {
          compilationMode: 'annotation',
          reportDiagnostics: true,
          target: '19',
        },
        jsx: { runtime: 'automatic' },
      });

      // A successful build alone is insufficient: unsupported code can bail
      // out and run without the memoization these islands depend on.
      expect(result.fatal).toBe(false);
      expect(result.errors).toEqual([]);
      expect(result.code).toContain('react/compiler-runtime');
    });
  }
});
