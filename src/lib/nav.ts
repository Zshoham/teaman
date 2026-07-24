import { getCollection } from 'astro:content';
import { loadDailyWeeks, weekHref } from './dailies';
import { isPublishableDeckId } from './discover-decks.mjs';
import { listGuides } from './guides';

export interface NavSection {
  id: string;
  label: string;
  /** Where the nav link points. */
  href: string;
  /** Path prefix that marks this section active (`href` can point deeper). */
  dir: string;
  /** Content sections collapse into the mobile menu; `daily`/`decisions` stay put. */
  grouped: boolean;
}

const base = import.meta.env.BASE_URL;

/**
 * The header renders one link per section that has content. Vaults are free to
 * ship no slides or no guides at all, so an empty collection must not leave a
 * dead link in the nav — same rule the home page's type tabs already follow.
 */
export async function loadNavSections(): Promise<NavSection[]> {
  const [notes, slides, guides, weeks, decisions] = await Promise.all([
    getCollection('notes'),
    getCollection('slides'),
    listGuides(),
    loadDailyWeeks(),
    getCollection('decisions'),
  ]);

  const sections: NavSection[] = [];
  const push = (section: NavSection, has: boolean) => {
    if (has) sections.push(section);
  };

  push(
    { id: 'notes', label: 'notes', href: `${base}notes/`, dir: `${base}notes/`, grouped: true },
    notes.some(n => !n.data.draft),
  );
  push(
    { id: 'guides', label: 'guides', href: `${base}guides/`, dir: `${base}guides/`, grouped: true },
    guides.length > 0,
  );
  push(
    { id: 'slides', label: 'slides', href: `${base}slides/`, dir: `${base}slides/`, grouped: true },
    slides.some(s => !s.data.draft && isPublishableDeckId(s.id)),
  );
  // Link straight at the latest week. `/daily/` works too (it redirects), but
  // the redirect renders a brief intermediate page in static builds — pointing
  // at the resolved week URL keeps the click instant.
  push(
    {
      id: 'daily',
      label: 'daily',
      href: weeks[0] ? weekHref(weeks[0]) : `${base}daily/`,
      dir: `${base}daily/`,
      grouped: false,
    },
    weeks.length > 0,
  );
  push(
    {
      id: 'decisions',
      label: 'decisions',
      href: `${base}decisions/`,
      dir: `${base}decisions/`,
      grouped: false,
    },
    decisions.length > 0,
  );

  return sections;
}

/** True when `pathname` is inside `section` — the nav's active-state rule. */
export function isSectionActive(section: NavSection, pathname: string): boolean {
  return pathname.startsWith(section.dir);
}
