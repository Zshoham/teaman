/**
 * The real Confluence the live suites run against, when the environment
 * names one (`bun run test:confluence-e2e` starts one and names it):
 *
 *   CONFLUENCE_CONTRACT_URL    the instance
 *   CONFLUENCE_CONTRACT_PAT    a personal access token, or
 *   CONFLUENCE_CONTRACT_USER + CONFLUENCE_CONTRACT_TOKEN for basic auth
 *   CONFLUENCE_CONTRACT_ROOT   a scratch page the contract suite works under
 *
 * The live sync also creates (and deletes) a space of its own, so the user
 * needs permission to.
 *
 * @returns {null | { baseUrl: string, pat?: string, user?: string, token?: string, root?: string,
 *   rest: (path: string, init?: { method?: string, json?: unknown }) => Promise<any> }}
 */
export function liveConfluence() {
  const url = process.env.CONFLUENCE_CONTRACT_URL;
  if (!url) return null;
  const baseUrl = url.replace(/\/+$/, '');
  const pat = process.env.CONFLUENCE_CONTRACT_PAT;
  const user = process.env.CONFLUENCE_CONTRACT_USER;
  const token = process.env.CONFLUENCE_CONTRACT_TOKEN;
  const authorization = pat ? `Bearer ${pat}` : `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`;

  // The REST calls the client does not make: setting up and tearing down.
  async function rest(path, { method = 'GET', json } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      body: json === undefined ? undefined : JSON.stringify(json),
      headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json' },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  return { baseUrl, pat, user, token, root: process.env.CONFLUENCE_CONTRACT_ROOT, rest };
}
