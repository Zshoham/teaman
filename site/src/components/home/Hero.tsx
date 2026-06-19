import { relTime } from "@/lib/format";

interface Props {
  eyebrow: string;
  title: string;
  description: string;
  statRows: Array<[string, number]>;
  lastUpdated: string;
}

export function Hero({ eyebrow, title, description, statRows, lastUpdated }: Props) {
  return (
    <section className="grid items-end gap-8 border-b border-border py-9 md:grid-cols-[minmax(0,1fr)_280px] md:gap-16 md:pt-9 md:pb-11">
      <div>
        <p className="m-0 font-mono text-meta uppercase tracking-label text-faint">{eyebrow}</p>
        <h1
          className="mt-3.5 font-serif text-4xl leading-[1.05] font-normal tracking-tight text-balance text-foreground md:text-display-lg [&>em]:italic [&>em]:text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: title }}
        />
        <p
          className="mt-5 max-w-[620px] font-serif text-[17px] leading-relaxed text-muted-foreground text-pretty"
          dangerouslySetInnerHTML={{ __html: description }}
        />
      </div>
      <aside className="flex flex-col gap-1.5">
        {statRows.map(([label, n]) => (
          <div
            key={label}
            className="stat-row flex items-baseline justify-between gap-3 border-t border-border py-1.5 font-mono"
          >
            <span className="text-meta text-muted-foreground">{label}</span>
            <span className="tabular-nums text-[13px] text-foreground">{String(n).padStart(3, "0")}</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 pt-2.5 font-mono">
          <span className="text-meta text-faint">last edit</span>
          <span className="tabular-nums text-meta text-muted-foreground">{relTime(lastUpdated)}</span>
        </div>
      </aside>
    </section>
  );
}
