// Integration tests: spawn the real CLI as a subprocess against throwaway temp
// vaults and assert on exit code, output, and filesystem effects. No full build
// is run here (that lives in the e2e/pack tier), but every invocation imports
// the CLI module, so Astro bin resolution is exercised on each spawn.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { basename, delimiter, join } from 'node:path';

const CLI = fileURLToPath(new URL('../teaman.mjs', import.meta.url));

// Run the CLI; cwd defaults to the given vault so bare (no-vault-arg) commands
// resolve against it.
function cli(args, { cwd } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'teaman-cli-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('teaman --version / help', () => {
  it('prints the engine version', () => {
    const { code, stdout } = cli(['--version']);
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('prints usage for help and for no command', () => {
    expect(cli(['help']).stdout).toMatch(/Usage: teaman/);
    expect(cli([]).stdout).toMatch(/Usage: teaman/);
  });

  it('fails on an unknown command', () => {
    const { code, stderr } = cli(['frobnicate']);
    expect(code).toBe(1);
    expect(stderr).toMatch(/unknown command "frobnicate"/);
  });
});

// The CLI runs only on Bun; under node it must say so rather than run on an
// untested runtime. `bun --bun` puts a `node` that is really Bun first on PATH
// (a `bun-node-*` dir), so look for the real one past it.
const nodeBin = (process.env.PATH ?? '').split(delimiter)
  .filter(dir => dir && !basename(dir).startsWith('bun-node-'))
  .map(dir => join(dir, process.platform === 'win32' ? 'node.exe' : 'node'))
  .find(existsSync);
describe.skipIf(!nodeBin)('teaman under node', () => {
  it('refuses to run and points at Bun', () => {
    const r = spawnSync(nodeBin, [CLI, '--version'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/teaman runs on Bun/);
  });
});

describe('teaman init', () => {
  it('scaffolds content dirs and an ESM-safe .mjs config', () => {
    const { code } = cli(['init'], { cwd: dir });
    expect(code).toBe(0);
    // P2 guard: the generated config must be .mjs, never a .js that a
    // CommonJS host project would refuse to import as ESM.
    expect(existsSync(join(dir, 'teaman.config.mjs'))).toBe(true);
    expect(existsSync(join(dir, 'teaman.config.js'))).toBe(false);
    for (const d of ['notes', 'references', 'guides', 'slides', 'dailies']) {
      expect(existsSync(join(dir, d))).toBe(true);
    }
  });

  it('leaves an existing config untouched on re-init', () => {
    cli(['init'], { cwd: dir });
    const cfg = join(dir, 'teaman.config.mjs');
    writeFileSync(cfg, '// edited by the user\nexport default { brand: "kept" };\n');
    const { stderr } = cli(['init'], { cwd: dir });
    expect(stderr).toMatch(/already exists/);
    expect(readFileSync(cfg, 'utf8')).toMatch(/edited by the user/);
  });

  it('produces a config that doctor can load in a bare (no package.json) dir', () => {
    // The decisive P2 check: a temp dir has no package.json, so Node would treat
    // a .js as CommonJS and choke on `export default`. doctor exiting 0 proves
    // the scaffolded .mjs loads as ESM.
    cli(['init'], { cwd: dir });
    const { code, stdout } = cli(['doctor'], { cwd: dir });
    expect(code).toBe(0);
    expect(stdout).toMatch(/ok —/);
  });
});

// What doctor checks is tested in-process: config in teaman-unit
// (validateConfig), content in src/lib/__tests__/vault-lint.test.mjs. These
// cover the CLI's part — loading the config file, printing findings, and the
// exit code.
describe('teaman doctor', () => {
  it('reports a config problem and exits 1', () => {
    writeFileSync(join(dir, 'teaman.config.mjs'), 'export default { tagline: "no brand here" };\n');
    const { code, stderr } = cli(['doctor', dir]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/config: brand: required/);
  });

  it('prints warnings without failing', () => {
    writeFileSync(join(dir, 'teaman.config.mjs'), 'export default { brand: "x", bogusKey: 1 };\n');
    const { code, stderr } = cli(['doctor', dir]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/unknown key "bogusKey"/);
  });

  it('reports a content problem and exits 1', () => {
    mkdirSync(join(dir, 'dailies'), { recursive: true });
    writeFileSync(join(dir, 'teaman.config.mjs'), 'export default { brand: "x" };\n');
    writeFileSync(join(dir, 'dailies', '2026-01-01.md'), '# just a heading, no frontmatter\n');
    const { code, stderr } = cli(['doctor', dir]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/2026-01-01\.md: date: required/);
  });
});

describe('teaman sync-confluence', () => {
  it('forwards --help straight through to the sync script', () => {
    const { code, stdout } = cli(['sync-confluence', '--help']);
    expect(code).toBe(0);
    expect(stdout).toMatch(/Sync repository markdown content to Confluence/);
  });

  it('surfaces the script\'s own config error and exit code (no double-wrap)', () => {
    const { code, stdout, stderr } = cli(['sync-confluence', '--content-dir', dir]);
    expect(code).toBe(1);
    expect(`${stdout}${stderr}`).toMatch(/Missing required configuration/);
    // the delegated exit code is mirrored, not re-wrapped by the CLI runner
    expect(stderr).not.toMatch(/exited with code/);
  });

  // An unreachable Confluence: the sync names its vault, then fails to connect.
  const unreachable = ['--base-url', 'http://127.0.0.1:9', '--pat', 'x', '--roots', 'notes=1'];

  it('syncs the current directory by default, like every command', () => {
    mkdirSync(join(dir, 'notes'));
    writeFileSync(join(dir, 'notes', 'a.md'), '# A\n');
    const { code, stdout } = cli(['sync-confluence', ...unreachable], { cwd: dir });
    expect(stdout).toContain(`Planning ${dir}: notes`);
    expect(code).toBe(1);
  });

  it('takes the vault as a positional, read from the caller\'s directory', () => {
    mkdirSync(join(dir, 'vault', 'notes'), { recursive: true });
    writeFileSync(join(dir, 'vault', 'notes', 'a.md'), '# A\n');
    const { stdout } = cli(['sync-confluence', 'vault', ...unreachable], { cwd: dir });
    expect(stdout).toContain(`Planning ${join(dir, 'vault')}: notes`);
  });

  it('refuses a vault that is not a directory, and a flag it does not know', () => {
    expect(cli(['sync-confluence', join(dir, 'nope'), ...unreachable]).stderr).toMatch(/vault path is not a directory/);
    expect(cli(['sync-confluence', '--frobnicate']).stderr).toMatch(/Unknown option '--frobnicate'/);
  });

  it('listed in the top-level help', () => {
    expect(cli(['help']).stdout).toMatch(/sync-confluence \[vault\]/);
  });
});

describe('teaman build', () => {
  it('refuses to use the vault root as output without deleting it', () => {
    writeFileSync(join(dir, 'keep.txt'), 'safe');
    const { code, stderr } = cli(['build', dir, '--out', dir]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/refusing unsafe output path/);
    expect(readFileSync(join(dir, 'keep.txt'), 'utf8')).toBe('safe');
  });

  it('refuses to use vault/public as output without deleting its assets', () => {
    mkdirSync(join(dir, 'public'), { recursive: true });
    writeFileSync(join(dir, 'public', 'keep.txt'), 'safe');
    const { code, stderr } = cli(['build', dir, '--out', join(dir, 'public')]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/refusing unsafe output path/);
    expect(readFileSync(join(dir, 'public', 'keep.txt'), 'utf8')).toBe('safe');
  });

  it('refuses to overwrite an existing non-empty dir that is not a previous build', () => {
    const outDir = join(dir, 'existing-data');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'note.md'), 'keep me');
    const { code, stderr } = cli(['build', dir, '--out', outDir]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/refusing/);
    expect(readFileSync(join(outDir, 'note.md'), 'utf8')).toBe('keep me');
  });

  it('fails when vault path is not a directory', () => {
    const fakePath = join(dir, 'not-a-dir');
    writeFileSync(fakePath, 'not a directory');
    const { code, stderr } = cli(['build', fakePath]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/not a directory/);
  });

  it('fails when vault path does not exist', () => {
    const { code, stderr } = cli(['build', join(dir, 'nonexistent')]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/not a directory/);
  });
});
