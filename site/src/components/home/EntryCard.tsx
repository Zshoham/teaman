import { TYPE_LABEL, type Entry } from "@/lib/entries";
import { fmtDate } from "@/lib/format";

interface Props {
  entry: Entry;
}

export function EntryCard({ entry: e }: Props) {
  return (
    <article
      className="entry py-7 [&:not([hidden])~&:not([hidden])]:border-t [&:not([hidden])~&:not([hidden])]:border-border"
      data-entry
      data-type={e.type}
      data-tags={e.tags.join(" ")}
      data-updated={e.updated}
      data-created={e.created}
      data-title={e.title.toLowerCase()}
    >
      <div className="mb-2 flex items-baseline gap-3 font-mono text-[11px]">
        <span className="tabular-nums text-faint">{fmtDate(e.updated)}</span>
        <span className="text-primary">{TYPE_LABEL[e.type]}</span>
        <span className="ml-auto tabular-nums whitespace-nowrap text-faint">{e.meta}</span>
      </div>
      <h3 className="entry-title m-0 font-serif text-2xl leading-tight font-normal tracking-tight text-balance text-foreground md:text-[28px]">
        <a href={e.href} className="text-inherit no-underline hover:text-primary">
          {e.title}
        </a>
      </h3>
      {e.excerpt && (
        <p className="mt-3 max-w-[700px] font-serif text-[15px] leading-relaxed text-muted-foreground text-pretty md:text-base">
          {e.excerpt}
        </p>
      )}
      {e.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {e.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] tracking-wide text-faint hover:text-primary"
              data-tag={tag}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
