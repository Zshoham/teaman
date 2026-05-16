/**
 * Wires up the daily-page archive popover: open/close, outside-click + Escape
 * dismissal, and month-by-month navigation through the pre-rendered months.
 *
 * The picker server-renders every month between the earliest and latest weeks
 * with content. The script's only job is to flip `hidden` on the month panel
 * + label that should currently be visible, and disable the prev/next buttons
 * when at the data bounds.
 */
export function initArchive(): void {
  const root = document.querySelector<HTMLElement>('[data-archive]');
  if (!root) return;

  const toggle = root.querySelector<HTMLButtonElement>('[data-archive-toggle]');
  const popover = root.querySelector<HTMLElement>('[data-archive-popover]');
  const prevBtn = root.querySelector<HTMLButtonElement>('[data-archive-prev]');
  const nextBtn = root.querySelector<HTMLButtonElement>('[data-archive-next]');
  const labels = Array.from(root.querySelectorAll<HTMLElement>('[data-archive-label] [data-month]'));
  const monthPanels = Array.from(root.querySelectorAll<HTMLElement>('.month[data-month]'));
  if (!toggle || !popover || !prevBtn || !nextBtn) return;

  const monthKeys = monthPanels.map(p => p.dataset.month!).sort();
  let currentMonth = monthPanels.find(p => !p.hidden)?.dataset.month ?? monthKeys[monthKeys.length - 1];

  function showMonth(key: string): void {
    currentMonth = key;
    for (const panel of monthPanels) panel.hidden = panel.dataset.month !== key;
    for (const label of labels) label.hidden = label.dataset.month !== key;
    const idx = monthKeys.indexOf(key);
    prevBtn!.disabled = idx <= 0;
    nextBtn!.disabled = idx === -1 || idx >= monthKeys.length - 1;
  }

  function open(): void {
    popover!.hidden = false;
    toggle!.setAttribute('aria-expanded', 'true');
    showMonth(currentMonth); // re-sync nav button disabled state
  }

  function close(): void {
    popover!.hidden = true;
    toggle!.setAttribute('aria-expanded', 'false');
  }

  function toggleOpen(): void {
    if (popover!.hidden) open();
    else close();
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleOpen();
  });

  prevBtn.addEventListener('click', () => {
    const idx = monthKeys.indexOf(currentMonth);
    if (idx > 0) showMonth(monthKeys[idx - 1]);
  });

  nextBtn.addEventListener('click', () => {
    const idx = monthKeys.indexOf(currentMonth);
    if (idx !== -1 && idx < monthKeys.length - 1) showMonth(monthKeys[idx + 1]);
  });

  document.addEventListener('mousedown', (e) => {
    if (popover.hidden) return;
    const target = e.target as Node | null;
    if (!target || root.contains(target)) return;
    close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popover.hidden) close();
  });

  // Initial sync of disabled state.
  showMonth(currentMonth);
}
