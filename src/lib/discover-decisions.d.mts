export interface DiscoveredDecision {
  id: string;
  num: string;
  sourcePath: string;
  /** Under `decisionsRoot`, `/`-separated. */
  relPath: string;
  data: Record<string, unknown>;
  body: string;
}

/** Every ADR under `decisionsRoot`, recursively. */
export function discoverDecisions(decisionsRoot: string): DiscoveredDecision[];
