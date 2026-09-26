/**
 * Serves Eleanor Crossing: the game (through Vite, with hot reload) and the
 * data API under /api.
 *
 *   npx tsx server/main.ts                # tailnet only (the default)
 *   npx tsx server/main.ts --port 9000
 *   npx tsx server/main.ts --local        # this machine only
 *
 * By default the server binds only to this machine's Tailscale addresses and
 * 127.0.0.1, so nothing on the router's LAN can reach it. Tailscale
 * authenticates every connection.
 *
 * It also refuses any request whose Host header is not one of this machine's
 * own names. Without that check, a web page open on a tailnet device could
 * point its own domain at this machine (DNS rebinding) and read or change
 * game data through the browser.
 *
 * Data lives in data/eleanor-crossing.json (override with --data).
 */
import { execFile } from 'node:child_process';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import { resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { createServer as createVite } from 'vite';
import { createApi } from './api';
import { hostName } from './hosts';
import { JsonFileStore } from './store';

const ROOT = resolve(import.meta.dirname, '..');

interface TailscaleNode {
  addresses: string[];
  dnsName: string;
}

async function tailscaleSelf(): Promise<TailscaleNode> {
  let stdout: string;
  try {
    ({ stdout } = await promisify(execFile)('tailscale', ['status', '--json'], { timeout: 10_000 }));
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    if (e.code === 'ENOENT') throw new Error('tailscale is not installed');
    throw new Error(e.stderr?.trim().split('\n')[0] || 'tailscale is not running');
  }
  const status = JSON.parse(stdout) as { BackendState?: string; Self?: { TailscaleIPs?: string[]; DNSName?: string } };
  const addresses = status.Self?.TailscaleIPs ?? [];
  if (!addresses.length) throw new Error('this machine has no Tailscale address — run `tailscale up`');
  if (status.BackendState && status.BackendState !== 'Running') {
    throw new Error(`tailscale backend is ${status.BackendState} — run \`tailscale up\``);
  }
  return { addresses, dnsName: (status.Self?.DNSName ?? '').replace(/\.$/, '') };
}

function url(host: string, port: number): string {
  return `http://${host.includes(':') ? `[${host}]` : host}:${port}/`;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: '8003' },
      local: { type: 'boolean', default: false },
      data: { type: 'string', default: resolve(ROOT, 'data/eleanor-crossing.json') },
    },
  });
  const port = Number(values.port);

  let node: TailscaleNode | null = null;
  if (!values.local) {
    try {
      node = await tailscaleSelf();
    } catch (err) {
      console.error(`\n  cannot serve on the tailnet: ${(err as Error).message}`);
      console.error('  fix it, or use --local for this machine only.\n');
      return 2;
    }
  }
  const addresses = [...(node?.addresses ?? []), '127.0.0.1'];
  const hosts = new Set([...addresses, 'localhost']);
  if (node?.dnsName) hosts.add(node.dnsName.toLowerCase()).add(node.dnsName.split('.')[0].toLowerCase());

  const store = await JsonFileStore.open(values.data);
  const api = createApi(store);

  const servers: Server[] = addresses.map(() => createServer());
  const vite = await createVite({
    root: ROOT,
    server: { middlewareMode: true, ws: { server: servers[0] }, allowedHosts: [...hosts] },
  });
  // Vite listens for hot-reload websockets on the first server; pass the others' along.
  for (const s of servers.slice(1)) s.on('upgrade', (req, socket, head) => servers[0].emit('upgrade', req, socket, head));

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    if (!hosts.has(hostName(req.headers.host))) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Unknown host name. Use this machine’s tailnet address.\n');
      return;
    }
    if (await api(req, res)) return;
    vite.middlewares(req, res);
  };

  try {
    await Promise.all(
      servers.map(
        (s, i) =>
          new Promise<void>((ok, fail) => {
            s.once('error', fail);
            s.on('request', (req, res) => void handle(req, res));
            s.listen(port, addresses[i], () => ok());
          }),
      ),
    );
  } catch (err) {
    console.error(`\n  could not bind port ${port}: ${(err as Error).message}\n`);
    await vite.close();
    return 2;
  }

  console.log('\n  Eleanor Crossing');
  console.log(`  scope: ${node ? 'tailnet only' : 'this machine only'}`);
  console.log(`  data:  ${values.data}\n`);
  if (node?.dnsName) console.log(`  other devices  ${url(node.dnsName, port)}`);
  for (const a of node?.addresses ?? []) console.log(`                 ${url(a, port)}`);
  console.log(`  this machine   ${url('127.0.0.1', port)}\n`);

  const shutdown = async () => {
    for (const s of servers) s.close();
    await store.flush();
    await vite.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
  return 0;
}

const code = await main();
if (code !== 0) process.exit(code);
