import type { AdrStatus } from "@/lib/adr-shared";

/** The serializable slice of an ADR the island renders (no Astro entry). */
export interface AdrView {
  num: string;
  title: string;
  date: string;
  dateLabel: string;
  status: AdrStatus;
  tags: string[];
  summary: string;
  supersedes?: string;
  supersededBy?: string;
  /** Pre-rendered markdown body HTML for the modal. */
  bodyHtml: string;
}
