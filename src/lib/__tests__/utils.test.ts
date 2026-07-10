import { describe, expect, it } from 'vitest';

import { cn } from '../utils';

describe('cn', () => {
  it('keeps custom font sizes alongside semantic text colors', () => {
    expect(cn('text-meta-sm', 'text-faint')).toBe('text-meta-sm text-faint');
    expect(cn('text-meta', 'text-primary')).toBe('text-meta text-primary');
    expect(cn('text-meta-lg', 'text-muted-foreground')).toBe(
      'text-meta-lg text-muted-foreground',
    );
  });

  it('merges custom font sizes with standard and custom sizes', () => {
    expect(cn('text-xs', 'text-meta-sm')).toBe('text-meta-sm');
    expect(cn('text-meta-sm', 'text-xs')).toBe('text-xs');
    expect(cn('text-display', 'text-display-lg')).toBe('text-display-lg');
  });

  it('continues to merge conflicting semantic text colors', () => {
    expect(cn('text-faint', 'text-destructive')).toBe('text-destructive');
  });
});
