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
 * Narrow-screen collapse for the content sections (notes/guides/slides). The
 * header already wraps to three rows on mobile; five inline links would push it
 * further, so below `md` these fold into one trigger while daily/decisions —
 * the dated views people jump to most — stay directly clickable.
 */
export function NavMenu({ items, activeId }: Props) {
  if (items.length === 0) return null;
  const active = items.find((item) => item.id === activeId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex cursor-pointer items-center gap-1 border-b bg-transparent py-0.5 font-mono text-meta-lg transition-colors focus-visible:outline-none',
          active
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        )}
        aria-label="Browse sections"
      >
        {active ? active.label : 'browse'}
        <ChevronDownIcon className="size-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-auto min-w-36">
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
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
