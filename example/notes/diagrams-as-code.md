---
title: Diagrams as Code, Compiled at Build Time
tags: [tools, craft, meta]
date: 2026-05-06
---

# Diagrams as Code, Compiled at Build Time

Mermaid and PlantUML render in the browser, which is the right call for
sketches: the diagram follows the theme toggle live and costs the build
nothing. But some notation wants a real typesetter. TikZ needs TeX, Typst
needs its compiler — neither belongs in a visitor's browser tab.

So those compile once, at build time, into inline SVG. The ink is rewritten to
`currentColor` on the way through, which means even a TeX drawing follows the
light/dark toggle.

## TikZ

A fence with the `tikz` language runs through a WASM TeX engine — the same one
the Obsidian TikZJax plugin uses, so a vault that renders in Obsidian renders
here without edits:

```tikz
\begin{tikzpicture}[very thick]
  \node (c) at (90:1.6)  {capture};
  \node (d) at (210:1.6) {distill};
  \node (p) at (330:1.6) {publish};
  \draw[->] (c) to[bend right=25] (d);
  \draw[->] (d) to[bend right=25] (p);
  \draw[->] (p) to[bend right=25] (c);
  \node at (0,0) {$n{+}1$};
\end{tikzpicture}
```

## Typst

A `typst` fence gets the same treatment from the Typst compiler, which makes it
the cheapest way to put real mathematics in a note:

```typst
#set page(width: auto, height: auto, margin: 2em)
#set text(font: "New Computer Modern", size: 11pt)

// Helper function to draw memory blocks
#let mem-block(name, color, height: 3.5em) = {
  rect(
    width: 100%,
    height: height,
    fill: color,
    stroke: 0.5pt + black,
    radius: 2pt,
    align(center + horizon)[*#name*]
  )
}

#align(center)[
  = Operating System RAM Allocation Map
  #v(1.5em)

  #grid(
    columns: (120pt, 300pt),
    gutter: 8pt,
    align: (right + horizon, center),
    
    // Kernel Space Section
    [Max Address `0xFFFFFFFF`], 
    mem-block("Memory-Mapped Device Drivers", rgb("e1bee7")),
    
    [], 
    mem-block("Interrupt Vectors (IDT/IVT)", rgb("ffcdd2")),

    [], 
    mem-block("Kernel Heap", rgb("fff9c4")),

    [], 
    mem-block("Kernel Task Stacks", rgb("c8e6c9")),

    [*KERNEL SPACE* \ (Ring 0)], 
    mem-block("Kernel Data Structures & Code", rgb("bbdefb")),

    // Kernel/User Boundary
    [Boundary], 
    v(0.5em) + line(length: 100%, stroke: 1.5pt + luma(100)) + v(0.5em),

    // User Space Section
    [*USER SPACE* \ (Ring 3)], 
    mem-block("User Space Process Stacks \ (Grows Downward)", rgb("f5f5f5")),

    [], 
    rect(width: 100%, height: 4em, fill: none, stroke: none)[
      #align(center + horizon)[
        #text(fill: luma(120))[↓ Dynamic / Unallocated Memory ↑]
      ]
    ],

    [], 
    mem-block("User Space Process Heaps \ (Grows Upward)", rgb("f5f5f5")),

    [Min Address `0x00000000`], 
    mem-block("User Space Code & Data (BSS, Text)", rgb("f5f5f5")),
  )
]
```

The claim in [[tools-for-thought]] holds here too: the tool earns its place by
surviving a boring Tuesday. A diagram you can diff in git, that rebuilds
byte-identical from a content hash, survives a great many boring Tuesdays.
