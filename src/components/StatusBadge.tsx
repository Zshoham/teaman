import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, statusColor, type AdrStatus } from "@/lib/adr-shared";

/**
 * The single status pill used wherever a decision's status is shown — the
 * decisions timeline (cards + modal) and the home feed — so they always match.
 * Built on the shared `Badge` primitive; the status hue rides in as a tinted
 * fill + border via the global `--st-*` tokens.
 */
export function StatusBadge({
  status,
  className,
}: {
  status: AdrStatus;
  className?: string;
}) {
  const color = statusColor(status);
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-mono text-meta uppercase tracking-[0.06em]", className)}
      style={{
        color,
        borderColor: `color-mix(in oklab, ${color} 30%, var(--border))`,
        background: `color-mix(in oklab, ${color} 10%, transparent)`,
      }}
    >
      <span className="size-[6px] rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
