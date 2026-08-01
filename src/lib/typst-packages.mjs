import { readFileSync, readdirSync } from 'fs';
import { extname, join, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';

/**
 * Third-party Typst packages (showybox, codly) are vendored under
 * `resources/typst-packages/` and mounted as *shadow* files inside the
 * compiler's workspace: nothing is written to disk, so vaults stay
 * content-only, and nothing is fetched, so `teaman build` keeps working
 * offline with the exact versions the engine was tested against.
 *
 * The template imports them by workspace-absolute path
 * (`/_teaman/showybox/showy.typ`) rather than `@preview/...`, which would send
 * the compiler to packages.typst.org on first build.
 */
export const TYPST_PACKAGE_DIR = '_teaman';

const MOUNTED_EXTENSIONS = new Set(['.typ', '.json', '.png', '.svg']);

const packagesRoot = fileURLToPath(
  new URL('../../resources/typst-packages', import.meta.url),
);

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (MOUNTED_EXTENSIONS.has(extname(entry.name))) yield path;
  }
}

/** Workspace-relative paths of every vendored package file, `/`-separated. */
export function typstPackageFiles() {
  return [...walk(packagesRoot)]
    .map(path => `${TYPST_PACKAGE_DIR}/${relative(packagesRoot, path).split(sep).join('/')}`)
    .sort();
}

/**
 * Mount the vendored packages into an existing compiler's workspace. Shadow
 * paths must be absolute — the compiler resolves the workspace itself and will
 * not find files mapped under a relative one.
 */
export function mountTypstPackages(compiler, workspace) {
  const root = resolve(workspace);
  for (const file of typstPackageFiles()) {
    compiler.mapShadow(
      join(root, ...file.split('/')),
      readFileSync(join(packagesRoot, ...file.split('/').slice(1))),
    );
  }
}

/** Create a Typst compiler that can build the bundled reference template. */
export function createReferenceCompiler(workspace = process.cwd()) {
  const root = resolve(workspace);
  const compiler = NodeCompiler.create({ workspace: root });
  mountTypstPackages(compiler, root);
  return compiler;
}
