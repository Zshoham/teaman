export interface HtmlEmbedEdit {
  start: number;
  end: number;
  /** The embed target as written, e.g. `viz.html#step=2`. */
  target: string;
  replacement: string;
}

/** Every `![[*.html]]` embed in a slide's Markdown outside code, and its `<HtmlEmbed>` replacement. */
export function htmlEmbedEdits(markdown: string): HtmlEmbedEdit[];
