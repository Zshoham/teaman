export interface DiscoveredDecision {
  id: string;
  num: string;
  sourcePath: string;
  /** Under `decisionsRoot`, `/`-separated. */
  relPath: string;
  data: Record<string, unknown>;
  body: string;
  /** Why its frontmatter cannot be read; `data` is then empty. */
  error?: string;
}

/** Every ADR under `decisionsRoot`, recursively. */
export function discoverDecisions(
  decisionsRoot: string,
  files?: Array<Omit<DiscoveredDecision, 'num'>>,
): DiscoveredDecision[];
