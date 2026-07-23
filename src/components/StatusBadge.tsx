import { Badge, type BadgeProps } from '@/components/reui/badge';
import { cn } from '@/lib/utils';
import { STATUS_LABEL, type AdrStatus } from '@/lib/adr-shared';

const STATUS_VARIANT: Record<AdrStatus, BadgeProps['variant']> = {
  accepted: 'success-light',
  proposed: 'warning-light',
  superseded: 'info-light',
};

/**
 * The single status pill used wherever a decision's status is shown — the
 * decisions timeline (cards + modal) and the home feed — so they always match.
 * Built on ReUI's shared `Badge` primitive. Its semantic variants are mapped
 * back to the vault's theme-reactive `--st-*` tokens in global.css.
 */
export function StatusBadge({
  status,
  className,
}: {
  status: AdrStatus;
  className?: string;
}) {
  return (
    <Badge
      variant={STATUS_VARIANT[status]}
      radius="full"
      className={cn('font-mono uppercase tracking-label-sm', className)}
      data-adr-status={status}
    >
      <span className="ms-0.25 size-1.25 rounded-full! bg-[currentColor]" />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
