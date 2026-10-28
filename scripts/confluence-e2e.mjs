// Live Confluence test: start a throwaway Confluence Data Center in Docker
// (PostgreSQL beside it), set it up the way an admin would through its setup
// wizard, and run the two suites that need a real instance against it — the
// contract suite (scripts/__tests__/confluence-contract.test.mjs: does
// Confluence still answer as the fake says it does) and the live sync
// (scripts/__tests__/sync-live.test.mjs: `teaman sync-confluence --apply` of
// the example vault). Everything else tests the sync against the fake; this
// is the check that the fake is right.
//
// Run with `bun run test:confluence-e2e`. Needs Docker and ~3 GB of memory;
// the first start takes a few minutes. Options:
//   --keep    leave the instance running afterwards (prints how to reach it)
// Environment:
//   CONFLUENCE_E2E_IMAGE    the image (default atlassian/confluence:9.2, the LTS)
//   CONFLUENCE_E2E_PORT     the host port (default 8090)
//   CONFLUENCE_E2E_LICENSE  a license; by default Atlassian's published
//                           3-hour test ("timebomb") license is fetched

import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const engineDir = fileURLToPath(new URL('..', import.meta.url));
const keep = process.argv.includes('--keep');
const image = process.env.CONFLUENCE_E2E_IMAGE ?? 'atlassian/confluence:9.2';
const port = process.env.CONFLUENCE_E2E_PORT ?? '8090';
const baseUrl = `http://localhost:${port}`;
const admin = { user: 'admin', password: 'admin' };
const names = { network: 'teaman-confluence-e2e', db: 'teaman-confluence-e2e-db', app: 'teaman-confluence-e2e' };

const bold = s => `\x1b[1m${s}\x1b[0m`;
const step = msg => console.log(`\n${bold(`▸ ${msg}`)}`);
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// `-v`: both images declare a data volume (PostgreSQL's data, Confluence's
// home), which outlives its container unless removed with it.
function removeContainers() {
  for (const name of [names.app, names.db]) spawnSync('docker', ['rm', '-fv', name], { stdio: 'ignore' });
  spawnSync('docker', ['network', 'rm', names.network], { stdio: 'ignore' });
}

async function until(what, minutes, check) {
  const deadline = Date.now() + minutes * 60_000;
  for (;;) {
    const done = await check().catch(() => false);
    if (done) return done;
    if (Date.now() > deadline) throw new Error(`Timed out after ${minutes} minutes waiting for ${what}`);
    await sleep(3000);
  }
}

// Atlassian publishes short-lived licenses for testing against Data Center;
// the page carries them as Markdown code blocks inside its JSON payload.
async function testLicense() {
  if (process.env.CONFLUENCE_E2E_LICENSE) return process.env.CONFLUENCE_E2E_LICENSE;
  const page = 'https://developer.atlassian.com/platform/marketplace/timebomb-licenses-for-testing-server-apps/';
  const html = await (await fetch(page)).text();
  const at = html.indexOf('Confluence Data Center license, expires in 3 hours');
  const block = at === -1 ? null : html.slice(at, at + 5000).match(/```\s*bash\\n(.*?)\\n```/);
  if (!block) throw new Error(`No Confluence test license found on ${page}; set CONFLUENCE_E2E_LICENSE`);
  return block[1].replaceAll('\\n', '\n').trim();
}

/**
 * The setup wizard, as a browser walks it: one form per step, each posted
 * with the session cookie and the page's XSRF token, each landing on the next
 * step's page. A step that lands anywhere else failed; its page says why.
 */
async function runSetupWizard(license) {
  const cookies = new Map();
  async function request(path, form) {
    let url = new URL(path, baseUrl);
    let init = form ? { method: 'POST', body: new URLSearchParams(form) } : { method: 'GET' };
    for (let hops = 0; hops < 10; hops++) {
      const response = await fetch(url, {
        ...init,
        redirect: 'manual',
        headers: { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') },
      });
      for (const header of response.headers.getSetCookie()) {
        const [pair] = header.split(';');
        const eq = pair.indexOf('=');
        cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
      const location = response.headers.get('location');
      if (response.status < 300 || response.status >= 400 || !location) {
        return { url: url.pathname, html: await response.text() };
      }
      url = new URL(location, url);
      init = { method: 'GET' };
    }
    throw new Error(`Too many redirects from ${path}`);
  }

  const steps = [
    ['/setup/dosetuplicense.action', { confLicenseString: license, setupTypeCustom: 'Next' }, '/setup/setupcluster-start.action'],
    ['/setup/setupcluster.action', { newCluster: 'skipCluster' }, '/setup/setupdata-start.action'],
    ['/setup/setupdata.action', { contentChoice: 'blank', dbchoiceSelect: 'Empty Site' }, '/setup/setupusermanagementchoice-start.action'],
    ['/setup/setupusermanagementchoice.action', { userManagementChoice: 'internal', internal: 'Next' }, '/setup/setupadministrator-start.action'],
    ['/setup/setupadministrator.action', {
      username: admin.user, fullName: 'Admin', email: 'admin@example.com',
      password: admin.password, confirm: admin.password, 'setup-next-button': 'Next',
    }, '/setup/finishsetup.action'],
  ];
  let page = await request('/bootstrap/selectsetupstep.action');
  if (page.url !== '/setup/setuplicense.action') throw new Error(`The setup wizard opened on ${page.url}, not the license step`);
  for (const [action, form, next] of steps) {
    const token = page.html.match(/name="atl_token" value="([^"]+)"/)?.[1];
    page = await request(action, { ...form, atl_token: token });
    if (page.url !== next) {
      const error = page.html.match(/class="[^"]*error[^"]*"[^>]*>\s*([^<]+)/)?.[1]?.trim();
      throw new Error(`Setup step ${action} landed on ${page.url}, not ${next}${error ? `: ${error}` : ''}`);
    }
  }
}

async function adminRest(path, json) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: json ? 'POST' : 'GET',
    body: json && JSON.stringify(json),
    headers: {
      Authorization: `Basic ${Buffer.from(`${admin.user}:${admin.password}`).toString('base64')}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

let failed = false;
try {
  step(`Starting ${image} and PostgreSQL`);
  removeContainers();
  const license = await testLicense();
  docker('network', 'create', names.network);
  docker('run', '-d', '--name', names.db, '--network', names.network,
    '-e', 'POSTGRES_USER=confluence', '-e', 'POSTGRES_PASSWORD=confluence', '-e', 'POSTGRES_DB=confluence',
    'postgres:15');
  await until('PostgreSQL', 2, async () => spawnSync('docker', ['exec', names.db, 'pg_isready', '-U', 'confluence']).status === 0);
  docker('run', '-d', '--name', names.app, '--network', names.network, '-p', `127.0.0.1:${port}:8090`,
    '-e', 'ATL_DB_TYPE=postgresql',
    '-e', `ATL_JDBC_URL=jdbc:postgresql://${names.db}:5432/confluence`,
    '-e', 'ATL_JDBC_USER=confluence', '-e', 'ATL_JDBC_PASSWORD=confluence',
    '-e', 'JVM_MINIMUM_MEMORY=1024m', '-e', 'JVM_MAXIMUM_MEMORY=2048m',
    image);

  step('Waiting for Confluence to start');
  await until('Confluence to answer', 10, async () => {
    const response = await fetch(baseUrl, { redirect: 'manual' });
    return response.headers.get('location')?.includes('selectsetupstep');
  });

  step('Setting it up through its setup wizard');
  await runSetupWizard(license);

  step('Creating a scratch space and a personal access token');
  const space = await adminRest('/rest/api/space', { key: 'SCRATCH', name: 'Contract scratch' });
  const home = space.homepage?.id ?? (await adminRest('/rest/api/space/SCRATCH?expand=homepage')).homepage.id;
  const { rawToken } = await adminRest('/rest/pat/latest/tokens', { name: 'teaman-e2e', expirationDuration: 1 });

  step('Running the contract suite and the live sync');
  const result = spawnSync(process.execPath, [
    '--bun', 'vitest', 'run',
    'scripts/__tests__/confluence-contract.test.mjs',
    'scripts/__tests__/sync-live.test.mjs',
  ], {
    cwd: engineDir,
    stdio: 'inherit',
    env: { ...process.env, CONFLUENCE_CONTRACT_URL: baseUrl, CONFLUENCE_CONTRACT_PAT: rawToken, CONFLUENCE_CONTRACT_ROOT: home },
  });
  if (result.status !== 0) throw new Error('The live Confluence suites failed');
  console.log(`\n${bold('✓ Confluence e2e passed')}`);
} catch (error) {
  failed = true;
  console.error(`\n${bold('✗ Confluence e2e failed:')} ${error.message}`);
  if (!keep) {
    const logs = spawnSync('docker', ['logs', '--tail', '40', names.app], { encoding: 'utf8' });
    if (logs.stdout || logs.stderr) console.error(`\nLast Confluence log lines:\n${logs.stdout}${logs.stderr}`);
  }
} finally {
  if (keep) {
    console.log(`\nConfluence is still running at ${baseUrl} (${admin.user} / ${admin.password}).`);
    console.log(`Remove it with: docker rm -fv ${names.app} ${names.db} && docker network rm ${names.network}`);
  } else {
    step('Removing the instance');
    removeContainers();
  }
}
process.exitCode = failed ? 1 : 0;
