import { getPublished } from './published';
import { COLLECTIONS, type EntryType } from './collections.mjs';
import { loadDailyWeeks, weekHref } from './dailies';
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
 *
 * "Has content" means published content (see `getPublished`): a vault of
 * drafts has no section. Label, href, grouping and order come from the registry.
 */
export async function loadNavSections(): Promise<NavSection[]> {
  const [notes, references, slides, guides, weeks, decisions] = await Promise.all([
    getPublished('notes'),
    getPublished('references'),
    getPublished('slides'),
    listGuides(),
    loadDailyWeeks(),
    getPublished('decisions'),
  ]);

  const hasContent: Record<EntryType, boolean> = {
    note: notes.length > 0,
    reference: references.length > 0,
    guide: guides.length > 0,
    slides: slides.length > 0,
    daily: weeks.length > 0,
    decision: decisions.length > 0,
  };

  // Link straight at the latest week. `/daily/` works too (it redirects), but
  // the redirect renders a brief intermediate page in static builds — pointing
  // at the resolved week URL keeps the click instant.
  const deepLink: Partial<Record<EntryType, string>> = {
    daily: weeks[0] ? weekHref(weeks[0]) : undefined,
  };

  return COLLECTIONS
    .filter(collection => collection.nav !== null && hasContent[collection.type])
    // Grouped sections first, registry order within each group. The header
    // partitions them anyway, but keeping the list in render order means a
    // consumer that doesn't partition still gets the right sequence.
    .sort((a, b) => Number(b.nav === 'grouped') - Number(a.nav === 'grouped'))
    .map(collection => {
      const dir = `${base}${collection.route}/`;
      return {
        id: collection.route,
        label: collection.route,
        href: deepLink[collection.type] ?? dir,
        dir,
        grouped: collection.nav === 'grouped',
      };
    });
}

/** True when `pathname` is inside `section` — the nav's active-state rule. */
export function isSectionActive(section: NavSection, pathname: string): boolean {
  return pathname.startsWith(section.dir);
}
