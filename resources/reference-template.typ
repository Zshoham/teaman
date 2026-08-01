// Bundled long-form reference template. The build script appends a `#show`
// call and the converted Markdown body, keeping vaults content-only while the
// engine owns the printable design.
//
// showybox and codly are vendored under `resources/typst-packages/` and mounted
// as shadow files by `src/lib/typst-packages.mjs`, so these imports resolve
// without touching the network or the vault. See that module before changing
// the paths.
#import "/_teaman/showybox/showy.typ": showybox
#import "/_teaman/codly/codly.typ": codly, codly-init

// Typst's own default, named explicitly so the codly language chip can opt back
// out of the monospace context it is rendered inside.
#let teaman-body-font = ("Libertinus Serif", "New Computer Modern")
#let teaman-mono-font = ("DejaVu Sans Mono",)

// The printed palette, mirroring the site's warm-paper tokens so a downloaded
// PDF and the page it came from read as one document. Named rather than inlined
// because every rule below draws from the same six values.
#let teaman-ink = rgb("#242321")
#let teaman-muted = rgb("#5f5b55")
#let teaman-faint = rgb("#837e76")
#let teaman-accent = rgb("#c46b37")
#let teaman-accent-deep = rgb("#9a512c")
#let teaman-rule = rgb("#ddd8d0")

#let teaman-callout(type: "note", title: none, body) = {
  let accent = if type in ("danger", "error", "failure", "fail", "missing", "bug") {
    rgb("#b33a32")
  } else if type in ("warning", "caution", "attention") {
    rgb("#b96822")
  } else if type in ("success", "check", "done") {
    rgb("#39845b")
  } else if type in ("tip", "hint", "important", "abstract", "summary", "tldr") {
    rgb("#287f7a")
  } else if type in ("question", "help", "faq") {
    rgb("#9a6a16")
  } else if type == "example" {
    rgb("#7651a8")
  } else if type in ("quote", "cite") {
    rgb("#77736c")
  } else {
    rgb("#326fa8")
  }

  showybox(
    width: 100%,
    breakable: true,
    frame: (
      border-color: accent,
      title-color: accent.lighten(82%),
      body-color: accent.lighten(93%),
      thickness: (left: 2.5pt, rest: 0.4pt),
      radius: 3pt,
      inset: (x: 10pt, y: 8pt),
    ),
    title-style: (
      color: accent.darken(25%),
      weight: "bold",
      sep-thickness: 0pt,
    ),
    title: if title == none { "" } else { title },
    body,
  )
}

// Display names for the languages our Markdown fences actually carry. Anything
// missing falls back to codly's own formatting of the raw fence info string.
#let teaman-code-languages = (
  bash: (name: "Bash"),
  c: (name: "C"),
  cpp: (name: "C++"),
  cs: (name: "C#"),
  css: (name: "CSS"),
  diff: (name: "Diff"),
  docker: (name: "Docker"),
  dockerfile: (name: "Dockerfile"),
  go: (name: "Go"),
  graphql: (name: "GraphQL"),
  haskell: (name: "Haskell"),
  html: (name: "HTML"),
  ini: (name: "INI"),
  java: (name: "Java"),
  js: (name: "JavaScript"),
  javascript: (name: "JavaScript"),
  json: (name: "JSON"),
  jsonc: (name: "JSON"),
  jsx: (name: "JSX"),
  kotlin: (name: "Kotlin"),
  lua: (name: "Lua"),
  make: (name: "Make"),
  makefile: (name: "Makefile"),
  md: (name: "Markdown"),
  markdown: (name: "Markdown"),
  nix: (name: "Nix"),
  php: (name: "PHP"),
  ps1: (name: "PowerShell"),
  py: (name: "Python"),
  python: (name: "Python"),
  rb: (name: "Ruby"),
  ruby: (name: "Ruby"),
  rs: (name: "Rust"),
  rust: (name: "Rust"),
  scala: (name: "Scala"),
  sh: (name: "Shell"),
  shell: (name: "Shell"),
  sql: (name: "SQL"),
  svelte: (name: "Svelte"),
  swift: (name: "Swift"),
  toml: (name: "TOML"),
  ts: (name: "TypeScript"),
  typescript: (name: "TypeScript"),
  tsx: (name: "TSX"),
  typst: (name: "Typst"),
  vue: (name: "Vue"),
  xml: (name: "XML"),
  yaml: (name: "YAML"),
  yml: (name: "YAML"),
  zig: (name: "Zig"),
  zsh: (name: "Zsh"),
)

// A heading's own number, accented, with the gap that separates it from the
// title. `none` numbering (an unnumbered heading) contributes nothing.
#let teaman-heading-number(it) = if it.numbering != none {
  text(fill: teaman-accent-deep)[#counter(heading).display(it.numbering)]
  h(0.55em)
}

// The heading a page belongs to, for the running head: the last level-1
// heading that started at or before this point in the document. Restricted to
// outlined headings so the contents page's own title — which Typst emits as an
// un-outlined level-1 heading — never becomes the running head of chapter one.
#let teaman-running-chapter() = {
  let before = query(selector(heading.where(level: 1, outlined: true)).before(here()))
  if before.len() > 0 { before.last().body } else { none }
}

#let teaman-reference(
  title: "Untitled reference",
  summary: none,
  updated: none,
  tags: (),
  brand: "teaman",
  body,
) = {
  set document(title: title, author: brand)
  // A4 minus 31mm gutters is a ~148mm measure, which keeps the body near 80
  // characters a line at 11pt — the previous 25mm margins ran to ~95, long
  // enough that the eye loses the line return on a book-length document.
  set page(paper: "a4", margin: (top: 27mm, bottom: 24mm, x: 31mm))
  set text(font: teaman-body-font, size: 11pt, fill: teaman-ink, lang: "en")
  set par(justify: true, leading: 0.72em)
  set heading(numbering: "1.1")
  set list(indent: 1.2em, body-indent: 0.5em)
  set enum(indent: 1.2em, body-indent: 0.5em)

  // Headings never justify — a justified two-word heading spreads into the
  // word-gap comb that made the old title page look broken — and never hyphenate.
  show heading: set par(justify: false)
  show heading: set text(hyphenate: false)

  // The ladder has to stay legible for five levels, because an imported book's
  // chapters are demoted (reference-documents.mjs) and routinely reach level 5.
  // Size alone runs out around level 3, so the last two steps change voice
  // instead: bold italic, then small caps. This mirrors the web reader's
  // `.prose` heading scale in src/styles/global.css.
  show heading.where(level: 1): it => block(
    above: 2.1em,
    below: 0.85em,
    sticky: true,
    width: 100%,
    stroke: (bottom: 0.7pt + teaman-accent),
    inset: (bottom: 5pt),
    text(size: 15.5pt, weight: "bold")[#teaman-heading-number(it)#it.body],
  )
  show heading.where(level: 2): it => block(
    above: 1.7em,
    below: 0.75em,
    sticky: true,
    text(size: 12.5pt, weight: "bold")[#teaman-heading-number(it)#it.body],
  )
  show heading.where(level: 3): it => block(
    above: 1.45em,
    below: 0.6em,
    sticky: true,
    text(size: 11pt, weight: "bold")[#teaman-heading-number(it)#it.body],
  )
  show heading.where(level: 4): it => block(
    above: 1.3em,
    below: 0.5em,
    sticky: true,
    text(size: 10.5pt, weight: "bold", style: "italic")[#teaman-heading-number(it)#it.body],
  )
  show heading.where(level: 5): it => block(
    above: 1.2em,
    below: 0.45em,
    sticky: true,
    text(size: 10pt, fill: teaman-muted, tracking: 0.04em)[
      #smallcaps[#teaman-heading-number(it)#it.body]
    ],
  )

  show quote.where(block: true): it => block(
    width: 100%,
    inset: (left: 12pt),
    stroke: (left: 2pt + teaman-rule),
    text(fill: teaman-muted, style: "italic", it.body),
  )

  // Tables in the book style: horizontal rules only, a heavier pair closing the
  // block off, and no vertical strokes at all. The generated markup carries
  // nothing but `columns` and the header row, so this is the single place the
  // printed table design lives (see reference-pdf.mjs `renderTable`).
  set table(
    inset: (x: 7pt, y: 5.5pt),
    stroke: (_, y) => (
      left: none,
      right: none,
      bottom: none,
      top: if y == 0 { none } else if y == 1 { 0.5pt + teaman-ink }
        else { 0.35pt + teaman-rule },
    ),
  )
  show table.cell.where(y: 0): set text(weight: "bold")
  // Auto width, not 100%: a narrow table (an imported book is full of two-column
  // escape tables) would otherwise get closing rules running well past its own
  // columns.
  show table: it => block(
    stroke: (top: 0.8pt + teaman-ink, bottom: 0.8pt + teaman-ink),
    it,
  )

  show raw: set text(font: teaman-mono-font)
  show raw.where(block: true): set text(size: 8.8pt)
  show raw.where(block: false): it => box(
    fill: rgb("#f3f0ea"),
    inset: (x: 1.6pt, y: 0pt),
    outset: (y: 2.6pt),
    radius: 2pt,
    text(size: 9.2pt, fill: rgb("#4a4640"), it),
  )

  show: codly-init.with()
  codly(
    languages: teaman-code-languages,
    default-color: rgb("#9a512c"),
    fill: rgb("#faf9f6"),
    zebra-fill: none,
    stroke: 0.4pt + rgb("#d8d3ca"),
    radius: 3pt,
    inset: (x: 6pt, y: 2.5pt),
    breakable: true,
    display-icon: false,
    number-align: right,
    number-format: number => text(size: 7.5pt, fill: rgb("#a8a29a"))[#number],
    // Own the chip outright so an unlisted fence language ("grammaritems") gets
    // the same treatment as a known one instead of codly's raw fallback.
    lang-format: (name, ..) => box(
      fill: rgb("#f0eae2"),
      stroke: 0.4pt + rgb("#d8d3ca"),
      radius: 2pt,
      inset: (x: 4.5pt, y: 2.5pt),
      text(
        size: 7.5pt,
        font: teaman-body-font,
        weight: "medium",
        fill: rgb("#7a6a5c"),
      )[#name],
    ),
  )

  // ── Cover ────────────────────────────────────────────────────────
  // No folio and no running head: a title page that carries page furniture
  // reads as body matter. The title block sits a third of the way down rather
  // than at the top margin, so the empty lower half becomes deliberate.
  set page(header: none, footer: none, numbering: none)
  v(14%)
  block(
    width: 100%,
    inset: (left: 16pt),
    stroke: (left: 2pt + teaman-accent),
  )[
    #set par(justify: false)
    #text(size: 8pt, weight: "bold", fill: teaman-accent-deep, tracking: 1pt)[
      REFERENCE DOCUMENT
    ]
    #v(12pt)
    #text(size: 26pt, weight: "bold", hyphenate: false)[#title]
    #if summary != none {
      v(12pt)
      text(size: 12pt, fill: teaman-muted)[#summary]
    }
    #v(14pt)
    #text(size: 8.5pt, fill: teaman-faint)[
      #if updated != none [Updated #updated]
      #if updated != none and tags.len() > 0 [ · ]
      #if tags.len() > 0 [#tags.map(tag => "#" + tag).join("  ")]
    ]
  ]
  place(
    bottom + left,
    block(width: 100%, stroke: (top: 0.4pt + teaman-rule), inset: (top: 6pt))[
      #text(size: 8pt, fill: teaman-faint)[#brand]
    ],
  )

  // ── Front matter ─────────────────────────────────────────────────
  // Roman folios here and arabic restarting at the body is the convention that
  // lets "page 12" mean the same thing in the contents and in a citation, no
  // matter how many pages the contents itself grows to.
  pagebreak()
  set page(
    footer: context align(center)[
      #text(size: 8pt, fill: teaman-faint)[#brand · #counter(page).display("i")]
    ],
  )
  counter(page).update(1)
  show outline.entry.where(level: 1): it => {
    v(0.5em, weak: true)
    strong(it)
  }
  outline(title: [Contents], depth: 3, indent: auto)

  // ── Body ─────────────────────────────────────────────────────────
  pagebreak()
  set page(
    header: context {
      let chapter = teaman-running-chapter()
      if chapter != none {
        block(
          width: 100%,
          stroke: (bottom: 0.4pt + teaman-rule),
          inset: (bottom: 4pt),
        )[
          #set par(justify: false)
          #text(size: 8pt, fill: teaman-faint)[
            #smallcaps[#chapter] #h(1fr) #title
          ]
        ]
      }
    },
    footer: context align(center)[
      #text(size: 8pt, fill: teaman-faint)[#brand · #counter(page).display("1")]
    ],
  )
  counter(page).update(1)

  // Links keep the body colour and take a hairline accent rule underneath.
  // Colouring the text itself is the obvious move but the wrong one here: an
  // imported book is dense with cross-references, and recolouring every one of
  // them turns whole pages orange. An underline in body ink, on the other hand,
  // is indistinguishable from emphasis. The rule carries the signal, the accent
  // makes it deliberate, and the whole thing still reads as a link in greyscale
  // print — the same bargain the web reader strikes for `.prose a`.
  //
  // Declared here rather than with the other show rules so it starts below the
  // contents page: outline entries are links too, and underlining a dot-leader
  // list is noise, not information.
  show link: it => underline(offset: 1.8pt, stroke: 0.5pt + teaman-accent, it)

  body
}
