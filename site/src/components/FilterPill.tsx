import { type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { toggleVariants } from "@/components/ui/toggle";

interface Props extends ComponentProps<"button"> {
  /** Trailing count, e.g. number of entries in this filter. */
  count?: number;
  /**
   * Optional leading dot colour (CSS colour / var). Supplying it also switches
   * the pill to the multi-select treatment: a coloured border when selected and
   * a plain grey border when not — rather than the solid fill used by the
   * single-select content-type filters.
   */
  dotColor?: string;
  children: ReactNode;
}

/**
 * The single filter-toggle pill used by the home content-type filters and the
 * decisions status filters. Active state is driven by `aria-pressed`, so it
 * works whether the DOM `list-controller` (home) or React state (decisions)
 * sets it. With `dotColor` it renders the multi-select (coloured-border) style;
 * without it, the solid single-select style.
 */
export function FilterPill({ count, dotColor, className, children, ...props }: Props) {
  const pressed = props["aria-pressed"] === true || props["aria-pressed"] === "true";

  return (
    <button
      type="button"
      className={cn(
        toggleVariants({ variant: "outline", size: "sm" }),
        "cursor-pointer gap-2 rounded-full",
        dotColor
          ? cn(
              // multi-select: coloured border when on, dim grey border when off
              "text-muted-foreground hover:border-muted-foreground aria-pressed:bg-transparent! aria-pressed:text-foreground",
              !pressed && "opacity-50",
            )
          : // single-select: solid fill when on
            "text-muted-foreground aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background",
        className,
      )}
      style={dotColor && pressed ? { borderColor: `color-mix(in oklab, ${dotColor} 55%, var(--border))` } : undefined}
      {...props}
    >
      {dotColor && (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: pressed ? dotColor : "var(--faint)" }}
        />
      )}
      <span>{children}</span>
      {count != null && <span className="font-mono text-meta-sm tabular-nums opacity-60">{count}</span>}
    </button>
  );
}
