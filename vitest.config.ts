/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
});
