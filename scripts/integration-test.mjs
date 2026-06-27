// End-to-end packaging test: pack the engine into the real npm tarball, install
// it into a throwaway project *outside* this repo, build the bundled `example/`
// vault through the installed CLI, and assert the published artifacts exist.
//
// This covers the one thing unit tests and the in-repo `build:all` can't: the
// consumer path (`npm pack` → `npm install` → `teaman build <vault>`). It catches
// regressions the in-place build is blind to — an incomplete `files` list in
// package.json, a bin that doesn't resolve once installed, or a dependency the
// engine reaches for that isn't actually declared.
//
// Run with `npm run test:integration`. Set TEAMAN_KEEP_TMP=1 to keep the temp
// dir for debugging instead of cleaning it up.

import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, cpSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

const engineDir = fileURLToPath(new URL('..', import.meta.url));
const exampleVault = join(engineDir, 'example');
const enginePkg = JSON.parse(readFileSync(join(engineDir, 'package.json'), 'utf8'));
const VERSION = enginePkg.version;

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

function step(msg) {
  console.log(`\n${bold(`▸ ${msg}`)}`);
}

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

// A throwaway workspace outside the repo (the OS temp dir), so the build never
// sees this checkout's node_modules or the bundled-vault fallback.
const workDir = mkdtempSync(join(tmpdir(), 'teaman-integration-'));

try {
  // 1. Pack the engine exactly as it ships.
  step('Packing the engine (npm pack)');
  const packed = execFileSync('npm', ['pack', '--json', `--pack-destination=${workDir}`], {
    cwd: engineDir,
    encoding: 'utf8',
  });
  const tarball = join(workDir, JSON.parse(packed)[0].filename);
  if (!existsSync(tarball)) throw new Error(`npm pack did not produce ${tarball}`);

  // 2. Install the tarball into a fresh consumer project.
  const consumer = join(workDir, 'consumer');
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'teaman-integration-consumer', version: '1.0.0', private: true }, null, 2) + '\n',
  );
  step('Installing the tarball into a throwaway project');
  run('npm', ['install', tarball, '--no-audit', '--no-fund'], { cwd: consumer });

  const cli = join(consumer, 'node_modules', '@zshoham', 'teaman', 'bin', 'teaman.mjs');
  if (!existsSync(cli)) throw new Error(`installed CLI not found at ${cli}`);

  // 3. Build a copy of the example vault that lives outside the repo.
  const vault = join(workDir, 'vault');
  cpSync(exampleVault, vault, { recursive: true });
  step('Building the example vault through the installed CLI');
  run(process.execPath, [cli, 'build', vault], { cwd: consumer });

  // 4. Assert the published artifacts exist (Astro pages + Slidev deck + Pagefind).
  step('Verifying build output');
  const dist = join(vault, 'dist');
  const required = [
    'index.html',
    'notes/vault-architecture/index.html',
    'guides/using-this-system/index.html',
    'guides/using-this-system/adding-notes/index.html',
    'daily/index.html',
    'decisions/index.html',
    'slides/intro/index.html',
    'pagefind/pagefind.js',
  ];
  const missing = required.filter((rel) => !existsSync(join(dist, rel)));
  if (missing.length) {
    throw new Error(`missing build artifacts:\n  ${missing.join('\n  ')}`);
  }

  // The generator meta proves the page came from the *installed* engine at the
  // version we just packed — not a stale in-repo build.
  const home = readFileSync(join(dist, 'index.html'), 'utf8');
  const expected = `content="teaman ${VERSION}"`;
  if (!home.includes(expected)) {
    throw new Error(`home page missing generator meta ${JSON.stringify(expected)}`);
  }

  console.log(green(`\n✓ integration test passed — packed, installed, and built ${required.length} artifacts`));
} catch (err) {
  console.error(red(`\n✗ integration test failed: ${err.message}`));
  console.error(red(`  inspect the workspace at ${workDir} (TEAMAN_KEEP_TMP=1 to keep it)`));
  process.exitCode = 1;
} finally {
  if (process.env.TEAMAN_KEEP_TMP) {
    console.log(`\nkept workspace at ${workDir}`);
  } else {
    rmSync(workDir, { recursive: true, force: true });
  }
}
