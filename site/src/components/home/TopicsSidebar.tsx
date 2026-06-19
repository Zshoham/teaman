import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface Topic {
  tag: string;
  count: number;
}

interface Props {
  topics: Topic[];
  /** How many topics to show before the "show more" toggle. */
  initialShown?: number;
}

export function TopicsSidebar({ topics, initialShown = 8 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const overflow = Math.max(0, topics.length - initialShown);

  return (
    <aside className="flex flex-col gap-9 self-start md:sticky md:top-[calc(var(--header-h)_+_1.5rem)]">
      <section>
        <h2 className="m-0 mb-3 border-b border-border pb-2 font-mono text-meta-sm font-normal uppercase tracking-label text-faint">
          topics
        </h2>
        <div className="flex flex-col gap-0.5" data-topics>
          {topics.map((t, i) => (
            <button
              key={t.tag}
              type="button"
              className="topic flex cursor-pointer items-baseline justify-between border-0 border-b border-dashed border-border bg-transparent py-1 text-left font-mono text-[12px] text-muted-foreground transition-colors hover:text-foreground [&.is-active]:text-foreground"
              data-tag={t.tag}
              data-topic-index={i}
              hidden={!expanded && i >= initialShown}
            >
              <span>
                <span className="text-faint [.topic.is-active_&]:text-primary">#</span>
                {t.tag}
              </span>
              <span className="tabular-nums text-faint">{String(t.count).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
        {overflow > 0 && (
          <button
            type="button"
            className="mt-2.5 inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent py-1 font-mono text-meta text-primary transition-colors"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
          >
            <span>{expanded ? "show fewer" : `show ${overflow} more`}</span>
            <ChevronDownIcon
              className={cn("size-3 text-faint transition-transform", expanded && "rotate-180")}
              aria-hidden="true"
            />
          </button>
        )}
      </section>
    </aside>
  );
}
