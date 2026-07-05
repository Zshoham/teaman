// Integration tests: spawn the real CLI as a subprocess against throwaway temp
// vaults and assert on exit code, output, and filesystem effects. No full build
// is run here (that lives in the e2e/pack tier), but every invocation imports
// the CLI module, so Astro bin resolution is exercised on each spawn.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

describe('teaman init', () => {
  it('scaffolds content dirs and an ESM-safe .mjs config', () => {
    const { code } = cli(['init'], { cwd: dir });
    expect(code).toBe(0);
    // P2 guard: the generated config must be .mjs, never a .js that a
    // CommonJS host project would refuse to import as ESM.
    expect(existsSync(join(dir, 'teaman.config.mjs'))).toBe(true);
    expect(existsSync(join(dir, 'teaman.config.js'))).toBe(false);
    for (const d of ['notes', 'guides', 'slides', 'dailies']) {
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

describe('teaman doctor', () => {
  it('reports a problem and exits 1 when brand is missing', () => {
    writeFileSync(join(dir, 'teaman.config.mjs'), 'export default { tagline: "no brand here" };\n');
    const { code, stderr } = cli(['doctor', dir]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/missing required "brand"/);
  });

  it('warns on unknown config keys without failing', () => {
    writeFileSync(join(dir, 'teaman.config.mjs'), 'export default { brand: "x", bogusKey: 1 };\n');
    const { code, stderr } = cli(['doctor', dir]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/unknown key "bogusKey"/);
  });

  it('flags a daily missing a date in frontmatter', () => {
    mkdirSync(join(dir, 'dailies'), { recursive: true });
    writeFileSync(join(dir, 'teaman.config.mjs'), 'export default { brand: "x" };\n');
    writeFileSync(join(dir, 'dailies', '2026-01-01.md'), '# just a heading, no frontmatter\n');
    const { code, stderr } = cli(['doctor', dir]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/needs a "date" in frontmatter/);
  });

  it('warns on unknown hero keys', () => {
    writeFileSync(join(dir, 'teaman.config.mjs'), 'export default { brand: "x", hero: { title: "ok", subtitle: "bad" } };\n');
    const { code, stderr } = cli(['doctor', dir]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/unknown hero key "subtitle"/);
  });

  it('warns on unknown slides keys', () => {
    writeFileSync(join(dir, 'teaman.config.mjs'), 'export default { brand: "x", slides: { accent: "red" } };\n');
    const { code, stderr } = cli(['doctor', dir]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/unknown slides key "accent"/);
  });

  it('flags a link missing required fields', () => {
    writeFileSync(join(dir, 'teaman.config.mjs'), 'export default { brand: "x", links: [{ url: "https://a" }] };\n');
    const { code, stderr } = cli(['doctor', dir]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/links\[0\] missing required "label"/);
  });

  it('warns on an unknown link key', () => {
    writeFileSync(join(dir, 'teaman.config.mjs'), 'export default { brand: "x", links: [{ label: "ok", url: "/x", color: "red" }] };\n');
    const { code, stderr } = cli(['doctor', dir]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/unknown link key "color"/);
  });

  it('accepts a minimal link (label + url only)', () => {
    writeFileSync(join(dir, 'teaman.config.mjs'), 'export default { brand: "x", links: [{ label: "ok", url: "/x" }] };\n');
    const { code, stderr } = cli(['doctor', dir]);
    expect(code).toBe(0);
    expect(stderr).not.toMatch(/link/);
  });

  it('flags links that is not an array', () => {
    writeFileSync(join(dir, 'teaman.config.mjs'), 'export default { brand: "x", links: "nope" };\n');
    const { code, stderr } = cli(['doctor', dir]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/"links" must be an array/);
  });

  it('flags a guide directory missing SUMMARY.md', () => {
    mkdirSync(join(dir, 'guides', 'my-guide'), { recursive: true });
    writeFileSync(join(dir, 'guides', 'my-guide', 'chapter.md'), '# Chapter\n');
    writeFileSync(join(dir, 'teaman.config.mjs'), 'export default { brand: "x" };\n');
    const { code, stderr } = cli(['doctor', dir]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/my-guide\/ has no SUMMARY.md/);
  });

  it('warns on unresolved wiki-links in notes', () => {
    mkdirSync(join(dir, 'notes'), { recursive: true });
    writeFileSync(join(dir, 'notes', 'a.md'), 'See [[nonexistent]] here.\n');
    writeFileSync(join(dir, 'teaman.config.mjs'), 'export default { brand: "x" };\n');
    const { code, stderr } = cli(['doctor', dir]);
    expect(code).toBe(0);
    expect(stderr).toMatch(/links to missing \[\[nonexistent\]\]/);
  });
});

describe('teaman build', () => {
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
