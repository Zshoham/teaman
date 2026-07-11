import { chapterHref, type Guide } from "@/lib/guides";
import { cn } from "@/lib/utils";

interface Props {
  guide: Guide;
  currentSlug: string;
}

export function GuideTOC({ guide, currentSlug }: Props) {
  const currentIdx = guide.chapters.findIndex((c) => c.slug === currentSlug);

  return (
    <aside className="guide-toc self-start md:sticky md:top-[calc(var(--header-h)_+_1.5rem)] md:pr-2">
      <details className="rounded-lg border border-border bg-card md:hidden">
        <summary className="cursor-pointer px-4 py-3 font-mono text-meta-lg text-foreground">
          Chapter {currentIdx + 1} of {guide.chapters.length} · {guide.chapters[currentIdx]?.title}
        </summary>
        <ol className="m-0 flex list-none flex-col gap-0.5 border-t border-border px-4 py-2">
          {guide.chapters.map((ch, i) => (
            <li key={ch.slug}>
              <a href={chapterHref(guide, ch.slug)} aria-current={i === currentIdx ? "page" : undefined} className={cn("flex gap-2.5 py-2 font-serif text-sm no-underline", i === currentIdx ? "text-primary" : "text-muted-foreground")}>
                <span className="font-mono text-meta-sm">{String(i + 1).padStart(2, "0")}</span>{ch.title}
              </a>
            </li>
          ))}
        </ol>
      </details>
      <div className="hidden md:block">
      <h2 className="m-0 mb-4 border-b border-border pb-2.5 font-mono text-meta-sm font-normal uppercase tracking-label text-faint">
        {guide.title}
      </h2>
      <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
        {guide.chapters.map((ch, i) => {
          const current = i === currentIdx;
          return (
            <li key={ch.slug} className={current ? "is-current" : ""}>
              <a
                href={chapterHref(guide, ch.slug)}
                className={cn(
                  "flex items-baseline gap-2.5 border-b border-dashed border-border py-1.5 text-meta-lg no-underline transition-colors",
                  current ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 font-mono text-meta-sm tabular-nums",
                    current ? "text-primary" : "text-faint",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-serif text-balance">{ch.title}</span>
              </a>
            </li>
          );
        })}
      </ol>
      </div>
    </aside>
  );
}
