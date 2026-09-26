import type { Adr } from "@/lib/adr";

/** The serializable slice of an ADR the island renders (no Astro entry). */
export type AdrView = Omit<Adr, "id" | "entry"> & {
  dateLabel: string;
  /** Pre-rendered markdown body HTML for the modal. */
  bodyHtml: string;
};
