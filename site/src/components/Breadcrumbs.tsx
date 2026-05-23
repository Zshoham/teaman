import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface BreadcrumbSegment {
  label: string;
  /** Omit to render as the current (non-link) segment. */
  href?: string;
}

interface Props {
  segments: BreadcrumbSegment[];
}

export function Breadcrumbs({ segments }: Props) {
  return (
    <Breadcrumb className="crumbs mb-7 font-mono text-[11px]">
      <BreadcrumbList>
        {segments.map((s, i) => (
          <Fragment key={`${s.label}-${i}`}>
            {i > 0 && <BreadcrumbSeparator>/</BreadcrumbSeparator>}
            <BreadcrumbItem>
              {s.href ? (
                <BreadcrumbLink href={s.href}>{s.label}</BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{s.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
