/** No `_`-prefixed segment in a path under the type's vault directory. */
export function isPublishedPath(relPath: string): boolean;

/** Not `draft: true`, and no `_`-prefixed path segment. */
export function isPublished(file: { data?: Record<string, unknown> | null; relPath: string }): boolean;
