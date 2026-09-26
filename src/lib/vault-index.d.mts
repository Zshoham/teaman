import type { EntryType } from './collections.mjs';

export interface VaultEntry {
  type: EntryType;
  /** Vault-relative, `/`-separated, without `.md`. */
  path: string;
  /** Absolute file, or directory for a guide. */
  sourcePath: string;
  kind: 'file' | 'folder';
  /** Site URL, base included. */
  href: string;
}

export interface WikiLinkResolution {
  entry: VaultEntry;
  href: string;
  /** `slug` when only the legacy slug comparison matched. */
  via: 'obsidian' | 'slug';
  /** The link carried a `#` fragment, which was dropped. */
  fragment: boolean;
  /** Other entries the link also matched. */
  alternatives: VaultEntry[];
}

export interface VaultIndex {
  entries: VaultEntry[];
  resolve(target: string, fromPath?: string): WikiLinkResolution | null;
}

export function createVaultIndex(vaultDir: string, options?: { base?: string }): VaultIndex;
