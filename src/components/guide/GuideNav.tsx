import { chapterHref, type Guide } from "@/lib/guides";
import { cn } from "@/lib/utils";

interface Props {
  guide: Guide;
  currentSlug: string;
}

const linkBase =
  "flex flex-col gap-1 rounded-lg border border-border px-4 py-3.5 text-foreground no-underline transition-colors hover:border-foreground hover:bg-muted";

export function GuideNav({ guide, currentSlug }: Props) {
  const idx = guide.chapters.findIndex((c) => c.slug === currentSlug);
  const prev = idx > 0 ? guide.chapters[idx - 1] : null;
  const next = idx >= 0 && idx < guide.chapters.length - 1 ? guide.chapters[idx + 1] : null;

  return (
    <nav
      className="mt-14 grid grid-cols-1 gap-4 border-t border-border pt-6 font-mono md:grid-cols-2"
      aria-label="Chapter navigation"
    >
      {prev ? (
        <a className={linkBase} href={chapterHref(guide, prev.slug)}>
          <span className="text-meta-sm uppercase tracking-label text-faint">← previous</span>
          <span className="font-serif text-[15px] text-balance text-foreground">{prev.title}</span>
        </a>
      ) : (
        <span />
      )}
      {next ? (
        <a
          className={cn("guide-nav-link next items-start md:items-end md:text-right", linkBase)}
          href={chapterHref(guide, next.slug)}
        >
          <span className="text-meta-sm uppercase tracking-label text-faint">next →</span>
          <span className="font-serif text-[15px] text-balance text-foreground">{next.title}</span>
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}
