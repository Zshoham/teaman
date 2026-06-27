// Unit tests for the CLI's pure logic. The module guards its dispatch behind an
// entrypoint check, so importing it here runs no commands — only parseArgs and
// satisfies are exercised.
import { describe, it, expect } from 'vitest';
import { parseArgs, satisfies } from '../teaman.mjs';

describe('parseArgs', () => {
  it('parses a command with no args', () => {
    expect(parseArgs(['doctor'])).toEqual({ command: 'doctor', vaultArg: undefined, opts: {} });
  });

  it('parses command + vault positional', () => {
    expect(parseArgs(['build', './vault'])).toEqual({
      command: 'build', vaultArg: './vault', opts: {},
    });
  });

  it('parses --key value options', () => {
    const r = parseArgs(['build', './vault', '--out', 'dist', '--base', '/x/']);
    expect(r.opts).toEqual({ out: 'dist', base: '/x/' });
  });

  it('treats a trailing --flag as a boolean', () => {
    expect(parseArgs(['dev', '--open']).opts).toEqual({ open: true });
  });

  it('treats a --flag followed by another --flag as boolean', () => {
    const r = parseArgs(['dev', '--open', '--port', '3001']);
    expect(r.opts).toEqual({ open: true, port: '3001' });
  });

  it('short-circuits on --version / -v before anything else', () => {
    expect(parseArgs(['-v'])).toEqual({ command: '--version' });
    expect(parseArgs(['build', '--version'])).toEqual({ command: '--version' });
  });

  it('maps --help / -h to the help command', () => {
    expect(parseArgs(['-h'])).toEqual({ command: 'help' });
    expect(parseArgs(['anything', '--help'])).toEqual({ command: 'help' });
  });

  it('returns undefined command for empty argv', () => {
    expect(parseArgs([])).toEqual({ command: undefined, vaultArg: undefined, opts: {} });
  });
});

describe('satisfies', () => {
  it('treats empty / wildcard ranges as always satisfied', () => {
    expect(satisfies('1.2.3', undefined)).toBe(true);
    expect(satisfies('1.2.3', '*')).toBe(true);
    expect(satisfies('1.2.3', 'x')).toBe(true);
  });

  it('handles caret ranges (same major, >= min.pat)', () => {
    expect(satisfies('1.2.0', '^1.0.0')).toBe(true);
    expect(satisfies('1.0.0', '^1.0.0')).toBe(true);
    expect(satisfies('2.0.0', '^1.0.0')).toBe(false);
    expect(satisfies('0.9.0', '^1.0.0')).toBe(false);
  });

  it('handles tilde ranges (same major.minor, >= pat)', () => {
    expect(satisfies('1.4.9', '~1.4.0')).toBe(true);
    expect(satisfies('1.5.0', '~1.4.0')).toBe(false);
    expect(satisfies('1.4.0', '~1.4.2')).toBe(false);
  });

  it('handles >= ranges', () => {
    expect(satisfies('1.4.0', '>=1.2.0')).toBe(true);
    expect(satisfies('1.1.0', '>=1.2.0')).toBe(false);
    expect(satisfies('2.0.0', '>=1.2.0')).toBe(true);
  });

  it('handles partial-version wildcards', () => {
    expect(satisfies('1.9.9', '1')).toBe(true);
    expect(satisfies('2.0.0', '1.x')).toBe(false);
    expect(satisfies('1.4.7', '1.4')).toBe(true);
    expect(satisfies('1.5.0', '1.4.x')).toBe(false);
  });

  it('handles exact ranges', () => {
    expect(satisfies('1.2.3', '1.2.3')).toBe(true);
    expect(satisfies('1.2.4', '1.2.3')).toBe(false);
  });

  it('does not cry wolf on unparseable ranges', () => {
    expect(satisfies('1.2.3', 'garbage')).toBe(true);
  });
});
