import { TYPE_LABEL, type Entry } from "@/lib/entries";
import { fmtDate } from "@/lib/format";

interface Props {
  entry: Entry;
}

export function EntryCard({ entry: e }: Props) {
  return (
    <article
      className="entry group py-7 [&:not([hidden])~&:not([hidden])]:border-t [&:not([hidden])~&:not([hidden])]:border-border"
      data-entry
      data-entry-id={e.id}
      data-type={e.type}
      data-tags={e.tags.join(" ")}
      data-updated={e.updated}
      data-created={e.created}
      data-title={e.title.toLowerCase()}
    >
      <div className="mb-2 flex items-baseline gap-3 font-mono text-meta">
        <span className="tabular-nums text-faint">{fmtDate(e.updated)}</span>
        <span className="text-primary">{TYPE_LABEL[e.type]}</span>
        <span className="ml-auto tabular-nums whitespace-nowrap text-faint">{e.meta}</span>
      </div>
      <h2 className="entry-title relative m-0 font-serif text-2xl leading-tight font-normal tracking-tight text-balance text-foreground md:text-[28px]">
        {/* Prompt-style row marker, hung in the page gutter on hover/focus. */}
        <span
          className="absolute top-0 -left-5 hidden font-mono text-[0.45em] leading-[2.78] text-primary opacity-0 sm:block transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          aria-hidden="true"
        >
          ▶
        </span>
        <a href={e.href} className="text-inherit no-underline hover:text-primary">
          {e.title}
        </a>
      </h2>
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
              className="cursor-pointer border-0 bg-transparent p-0 font-mono text-meta tracking-wide text-faint hover:text-primary"
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
