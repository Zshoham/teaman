export function fmtDate(iso: string): string {
  const d = new Date(iso);
  const m = d.toLocaleString('en-US', { month: 'short' }).toLowerCase();
  return `${String(d.getDate()).padStart(2, '0')} ${m} ${d.getFullYear()}`;
}

export function relTime(iso: string): string {
  const d = new Date(iso);
  const diffDays = (Date.now() - d.getTime()) / 86400000;
  if (diffDays < 1) return 'today';
  if (diffDays < 2) return 'yesterday';
  if (diffDays < 14) return `${Math.floor(diffDays)}d ago`;
  if (diffDays < 60) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}
