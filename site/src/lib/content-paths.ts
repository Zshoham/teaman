import { join } from 'path';
import { fileURLToPath } from 'url';

export const contentRoot = fileURLToPath(new URL('../../../content', import.meta.url));
export const guidesRoot = join(contentRoot, 'guides');
export const slidesRoot = join(contentRoot, 'slides');
