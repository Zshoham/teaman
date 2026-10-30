import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

export interface BreadcrumbSegment {
  label: string;
  /** Omit to render as the current (non-link) segment. */
  href?: string;
}

interface Props {
  /** The site brand; the root crumb reads `~/<brand>`, as the `ls` prompts do. */
  brand: string;
  segments: BreadcrumbSegment[];
}

/**
 * Rendered as a shell command: `$ cat ~/<brand>/notes/<id>`, with every
 * segment but the last a link. The prompt is decoration, so it is hidden from
 * screen readers, and the whole trail is kept out of the search index.
 *
 * Each `/` belongs to the segment after it, so a deep trail that wraps on a
 * narrow screen breaks before a `/segment`, never leaving a slash dangling at
 * the end of a line; wrapped lines hang under the path, past the prompt.
 */
export function Breadcrumbs({ brand, segments }: Props) {
  const base = import.meta.env.BASE_URL;
  return (
    <Breadcrumb className="crumbs mb-7 flex items-baseline gap-2 font-mono text-meta-lg md:text-base" data-pagefind-ignore="all">
      <span className="shrink-0 text-muted-foreground" aria-hidden="true">
        <span className="text-primary">$</span> cat
      </span>
      <BreadcrumbList className="min-w-0 gap-x-1 gap-y-0.5 text-[length:inherit]">
        <BreadcrumbItem>
          <BreadcrumbLink href={base} aria-label="Home">~/{brand}</BreadcrumbLink>
        </BreadcrumbItem>
        {segments.map((s, i) => (
          <BreadcrumbItem key={`${s.label}-${i}`} className="min-w-0 items-baseline">
            <span className="text-faint" role="presentation" aria-hidden="true">/</span>
            {s.href ? (
              <BreadcrumbLink href={s.href}>{s.label}</BreadcrumbLink>
            ) : (
              <BreadcrumbPage>{s.label}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
