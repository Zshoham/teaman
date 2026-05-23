import { XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * Rendered once; visibility and label are toggled by list-controller via the
 * `[data-active-tag]` / `[data-active-tag-name]` / `[data-tag-clear]` hooks.
 */
export function ActiveTagChip() {
  return (
    <Badge
      variant="outline"
      className="mb-2 h-8 gap-2.5 px-3 py-2 font-mono text-[11px]"
      data-active-tag
      hidden
    >
      <span className="text-faint">filtered by</span>
      <span className="text-primary text-[12px]" data-active-tag-name />
      <button
        type="button"
        className="ml-auto inline-flex cursor-pointer items-center gap-0.5 border-0 bg-transparent text-[11px] text-muted-foreground hover:text-foreground"
        data-tag-clear
      >
        clear
        <XIcon className="size-3" aria-hidden="true" />
      </button>
    </Badge>
  );
}
