import { ChevronDownIcon } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface NavMenuItem {
  id: string;
  label: string;
  href: string;
}

interface Props {
  items: NavMenuItem[];
  /** `id` of the item whose section the current page is in, if any. */
  activeId?: string;
}

/**
 * Narrow-screen collapse for the content sections (notes/references/guides/slides). The
 * header uses two rows on mobile; all inline links would push it
 * further, so below `xl` these fold into one trigger while daily/decisions —
 * the dated views people jump to most — stay directly clickable.
 */
export function NavMenu({ items, activeId }: Props) {
  if (items.length === 0) return null;
  const active = items.find((item) => item.id === activeId);
  const bracket = cn(
    'transition-colors',
    active ? 'text-primary' : 'text-transparent group-hover:text-faint',
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'group flex min-h-11 md:min-h-0 cursor-pointer items-center gap-0.5 bg-transparent font-mono text-meta-lg transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
        aria-label="Browse sections"
      >
        {/* One span, so the trigger's gap doesn't split the label from its
            slash; bracketed like the header links when a section is active. */}
        <span>
          <span className={bracket} aria-hidden="true">[</span>
          {active ? <>{active.label}<span aria-hidden="true">/</span></> : 'browse'}
          <span className={bracket} aria-hidden="true">]</span>
        </span>
        <ChevronDownIcon className="size-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-36">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            className="cursor-pointer font-mono text-meta-lg"
            render={
              <a
                href={item.href}
                className="no-underline"
                aria-current={item.id === activeId ? 'page' : undefined}
              />
            }
          >
            {/* One span, so the item's gap doesn't split the slash off; the
                current section is bracketed as it is in the header row. */}
            <span className={item.id === activeId ? 'text-foreground' : undefined}>
              <span className={item.id === activeId ? 'text-primary' : 'text-transparent'} aria-hidden="true">[</span>
              {item.label}<span aria-hidden="true">/</span>
              <span className={item.id === activeId ? 'text-primary' : 'text-transparent'} aria-hidden="true">]</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
