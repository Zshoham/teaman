/** Compiles ```tikz and ```typst fences into inline SVG at build time. Unlike
 *  mermaid/plantuml (rendered client-side, so they can follow the theme toggle
 *  live), TikZ needs a TeX engine and Typst a real compiler — far too heavy to
 *  ship to the browser. So these render during the build: `node-tikzjax` (the
 *  same WASM TeX the Obsidian TikZJax plugin uses — no system LaTeX required)
 *  and `@myriaddreamin/typst-ts-node-compiler` (native Typst via napi). Theme
 *  reactivity is recovered by rewriting black strokes/fills to `currentColor`,
 *  which resolves against the page like the inlined svg images do.
 *
 *  Compiles are cached in `cacheDir` keyed by a hash of the source, so only
 *  new or edited diagrams pay the compiler cost (TikZ ≈ 1s each). The cache
 *  directory is disposable — delete it to force a full re-render. A fence that
 *  fails to compile renders a quiet visible notice (like a bad mermaid block)
 *  and warns on the console rather than failing the whole build. */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Bump to invalidate every cached render (output format change, compiler
// option change, engine upgrade that should re-render).
const FORMAT_VERSION = 'v1';

const escapeHtml = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Black is the compilers' "default ink"; rewrite it to currentColor so text
// and strokes follow the site theme. Explicit non-black colors are kept —
// authors who want theme tokens can write var(--primary) via svg passthrough
// colors only in hand-written files, so black-as-ink is the contract here.
export function themeAdaptSvg(svg) {
  return svg
    .replace(/\b(fill|stroke)="(?:#0{3}(?:0{3})?|black)"/gi, '$1="currentColor"')
    .replace(/\b(fill|stroke):\s*(?:#0{3}(?:0{3})?|black)\b/gi, '$1:currentColor');
}

// Trim to the root <svg> tag and merge our classes into it (`content-svg` for
// the shared prose sizing, plus a per-language class for targeted styling).
export function classifySvg(source, extraClass) {
  const start = source.search(/<svg[\s>]/i);
  if (start === -1) return null;
  const svg = source.slice(start).trim();
  return svg.replace(/<svg\b[^>]*>/i, (tag) =>
    /\bclass\s*=\s*"/i.test(tag)
      ? tag.replace(/\bclass\s*=\s*"([^"]*)"/i, (_, cls) => `class="${cls} content-svg ${extraClass}"`)
      : tag.replace(/<svg/i, `<svg class="content-svg ${extraClass}"`),
  );
}

// ── compilers (lazy: only pages that actually carry a fence pay the import) ──

// One TeX-in-WASM run is heavy; serialize compiles so parallel page renders
// don't stack several engines in memory at once.
let tikzChain = Promise.resolve();
function compileTikz(source) {
  const job = async () => {
    const mod = (await import('node-tikzjax')).default;
    const tex2svg = typeof mod === 'function' ? mod : mod.default;
    // Authors write what goes between the document tags (usually just the
    // tikzpicture environment); wrap unless they provided the full document.
    const doc = /\\begin\{document\}/.test(source)
      ? source
      : `\\begin{document}\n${source}\n\\end{document}`;
    return tex2svg(doc, { showConsole: false });
  };
  const run = tikzChain.then(job, job);
  tikzChain = run.catch(() => {});
  return run;
}

let typstCompiler;
async function compileTypst(source) {
  const { NodeCompiler } = await import('@myriaddreamin/typst-ts-node-compiler');
  typstCompiler ??= NodeCompiler.create();
  // Typst defaults to an A4 page; diagrams and formulas want a canvas that
  // hugs the content. Skipped when the author sets the page themselves.
  const doc = /#set page\(/.test(source)
    ? source
    : `#set page(width: auto, height: auto, margin: 4pt)\n${source}`;
  const svg = typstCompiler.svg({ mainFileContent: doc });
  // The compiler memoizes every mainFileContent it has seen; evict old
  // entries so a long dev session doesn't grow without bound.
  typstCompiler.evictCache?.(10);
  return svg;
}

const DEFAULT_COMPILERS = { tikz: compileTikz, typst: compileTypst };

// ── the plugin ───────────────────────────────────────────────────────────────
export function remarkFenceSvg({ cacheDir, compilers } = {}) {
  const compile = { ...DEFAULT_COMPILERS, ...compilers };

  const cachePath = (lang, source) => {
    const hash = createHash('sha256')
      .update(`${FORMAT_VERSION}\0${lang}\0${source}`)
      .digest('hex')
      .slice(0, 16);
    return join(cacheDir, `${lang}-${hash}.svg`);
  };

  return async (tree) => {
    // Collect first, then compile: the transformer must be async and mdast
    // mutation during an async walk is easier to reason about in two phases.
    const fences = [];
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      node.children.forEach((child, index) => {
        if (child.type === 'code' && child.lang in compile) fences.push({ parent: node, index, node: child });
        else walk(child);
      });
    };
    walk(tree);
    if (fences.length === 0) return;

    mkdirSync(cacheDir, { recursive: true });
    for (const { parent, index, node } of fences) {
      const { lang, value: source } = node;
      const cached = cachePath(lang, source);
      let svg;
      if (existsSync(cached)) {
        svg = readFileSync(cached, 'utf8');
      } else {
        try {
          svg = classifySvg(themeAdaptSvg(await compile[lang](source)), `${lang}-svg`);
          if (svg === null) throw new Error('compiler produced no <svg> root');
          writeFileSync(cached, svg);
        } catch (error) {
          const reason = String(error?.message ?? error).split('\n')[0].slice(0, 300);
          console.warn(`[teaman] ${lang} fence failed to compile: ${reason}`);
          parent.children[index] = {
            type: 'html',
            value: `<pre class="diagram-error">${lang} diagram could not be rendered.\n${escapeHtml(reason)}</pre>`,
          };
          continue;
        }
      }
      parent.children[index] = { type: 'html', value: svg };
    }
  };
}
