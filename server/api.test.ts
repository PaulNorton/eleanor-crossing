import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCharacter, defaultAppearance } from '../src/character/model';
import { HttpCharacterRepository, HttpWorldStateRepository } from '../src/storage/httpRepositories';
import { migrateBrowserData } from '../src/storage/migrate';
import { createApi } from './api';
import { hostName } from './hosts';
import { JsonFileStore } from './store';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

let dir: string;
let dataFile: string;
let store: JsonFileStore;
let server: Server;
let base: string;

async function startServer() {
  store = await JsonFileStore.open(dataFile);
  const api = createApi(store);
  server = createServer(async (req, res) => {
    if (!(await api(req, res))) {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function stopServer() {
  await new Promise((ok) => server.close(ok));
  await store.flush();
}

const call = (path: string, init?: RequestInit) => fetch(base + path, init);
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const relativeFetch: typeof fetch = (input, init) => fetch(base + String(input), init);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'eleanor-'));
  dataFile = join(dir, 'data', 'game.json');
  await startServer();
});

afterEach(async () => {
  await stopServer();
  await rm(dir, { recursive: true, force: true });
});

describe('character API', () => {
  it('creates, lists, updates, and deletes a character', async () => {
    const c = createCharacter('Eleanor', defaultAppearance());
    const created = await call(`/api/characters/${c.id}`, json('PUT', c));
    expect(created.status).toBe(201);

    const list = await (await call('/api/characters')).json();
    expect(list.map((x: { name: string }) => x.name)).toEqual(['Eleanor']);

    const updated = await call(`/api/characters/${c.id}`, json('PUT', { ...c, name: 'Nell', createdAt: '1999-01-01' }));
    expect(updated.status).toBe(200);
    const body = await updated.json();
    expect(body.name).toBe('Nell');
    expect(body.createdAt).toBe(c.createdAt);

    expect((await call(`/api/characters/${c.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await call(`/api/characters/${c.id}`)).status).toBe(404);
  });

  it('rejects bad input', async () => {
    const c = createCharacter('Eleanor', defaultAppearance());
    expect((await call(`/api/characters/${c.id}`, json('PUT', { ...c, name: '' }))).status).toBe(400);
    expect((await call('/api/characters/other-id', json('PUT', c))).status).toBe(400);
    expect((await call(`/api/characters/${c.id}`, { method: 'PUT', body: JSON.stringify(c) })).status).toBe(415);
    const huge = { ...c, junk: 'x'.repeat(70_000) };
    expect((await call(`/api/characters/${c.id}`, json('PUT', huge))).status).toBe(413);
    expect((await call('/api/characters/bad%2Fid')).status).toBe(404);
    expect((await call('/api/characters', { method: 'POST' })).status).toBe(405);
  });

  it('stores positions only for existing characters and deletes them with the character', async () => {
    const c = createCharacter('Eleanor', defaultAppearance());
    const pos = { x: 1, z: 2, heading: 0.5 };
    expect((await call(`/api/characters/${c.id}/state`, json('PUT', pos))).status).toBe(404);
    await call(`/api/characters/${c.id}`, json('PUT', c));
    expect((await call(`/api/characters/${c.id}/state`, json('PUT', { x: 'left' }))).status).toBe(400);
    expect((await call(`/api/characters/${c.id}/state`, json('PUT', pos))).status).toBe(204);
    expect(await (await call(`/api/characters/${c.id}/state`)).json()).toEqual(pos);
    await call(`/api/characters/${c.id}`, { method: 'DELETE' });
    expect(await store.getPlayerState(c.id)).toBeNull();
  });

  it('keeps data across restarts', async () => {
    const c = createCharacter('Eleanor', defaultAppearance());
    await call(`/api/characters/${c.id}`, json('PUT', c));
    await call(`/api/characters/${c.id}/state`, json('PUT', { x: 3, z: 4, heading: 0 }));
    await stopServer();
    await startServer();
    expect((await store.getCharacter(c.id))?.name).toBe('Eleanor');
    expect(await store.getPlayerState(c.id)).toEqual({ x: 3, z: 4, heading: 0 });
    expect(JSON.parse(await readFile(dataFile, 'utf8')).version).toBe(1);
  });
});

describe('HTTP repositories', () => {
  it('round-trip through the real API', async () => {
    const local = memoryStore();
    const chars = new HttpCharacterRepository(local, relativeFetch);
    const states = new HttpWorldStateRepository(relativeFetch);
    const c = createCharacter('Eleanor', defaultAppearance());
    const saved = await chars.save(c);
    expect(saved.id).toBe(c.id);
    expect(await chars.list()).toHaveLength(1);
    expect(await chars.get('missing')).toBeNull();

    await states.setPlayerState(c.id, { x: 1, z: 1, heading: 1 });
    expect(await states.getPlayerState(c.id)).toEqual({ x: 1, z: 1, heading: 1 });

    await chars.setActiveId(c.id);
    await chars.remove(c.id);
    expect(await chars.getActiveId()).toBeNull();
    expect(await chars.list()).toEqual([]);
  });

  it('reports an unreachable server clearly', async () => {
    const down: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));
    await expect(new HttpCharacterRepository(memoryStore(), down).list()).rejects.toThrow('Could not reach the island server.');
  });
});

describe('migrateBrowserData', () => {
  it('uploads browser characters and positions once, then clears them', async () => {
    const local = memoryStore();
    const c = createCharacter('Eleanor', defaultAppearance());
    local.setItem('eleanor-crossing:characters', JSON.stringify([c]));
    local.setItem(`eleanor-crossing:player-state:${c.id}`, JSON.stringify({ x: 5, z: 6, heading: 0 }));
    local.setItem('eleanor-crossing:active-character', c.id);

    const chars = new HttpCharacterRepository(local, relativeFetch);
    const states = new HttpWorldStateRepository(relativeFetch);
    expect(await migrateBrowserData(local, chars, states)).toBe(1);
    expect((await chars.get(c.id))?.name).toBe('Eleanor');
    expect(await states.getPlayerState(c.id)).toEqual({ x: 5, z: 6, heading: 0 });
    expect([...local.data.keys()]).toEqual(['eleanor-crossing:active-character']);
    expect(await migrateBrowserData(local, chars, states)).toBe(0);
  });

  it('does not overwrite a character the server already has', async () => {
    const c = createCharacter('Eleanor', defaultAppearance());
    const chars = new HttpCharacterRepository(memoryStore(), relativeFetch);
    await chars.save({ ...c, name: 'Server' });
    const local = memoryStore();
    local.setItem('eleanor-crossing:characters', JSON.stringify([c]));
    expect(await migrateBrowserData(local, chars, new HttpWorldStateRepository(relativeFetch))).toBe(0);
    expect((await chars.get(c.id))?.name).toBe('Server');
  });
});

describe('hostName', () => {
  it.each([
    ['example.ts.net:8003', 'example.ts.net'],
    ['100.66.242.25:8003', '100.66.242.25'],
    ['[fd7a::1]:8003', 'fd7a::1'],
    ['LOCALHOST', 'localhost'],
    [undefined, ''],
  ])('%s → %s', (header, name) => {
    expect(hostName(header)).toBe(name);
  });
});

describe('player state API', () => {
  it('answers null for a character with no saved position', async () => {
    const c = createCharacter('Eleanor', defaultAppearance());
    await call(`/api/characters/${c.id}`, json('PUT', c));
    const res = await call(`/api/characters/${c.id}/state`);
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
    expect(await new HttpWorldStateRepository(relativeFetch).getPlayerState(c.id)).toBeNull();
  });

  it('keeps which house the character is in', async () => {
    const c = createCharacter('Eleanor', defaultAppearance());
    await call(`/api/characters/${c.id}`, json('PUT', c));
    await call(`/api/characters/${c.id}/state`, json('PUT', { x: 0, z: 2, heading: 0, inside: 'pip' }));
    expect(await (await call(`/api/characters/${c.id}/state`)).json()).toEqual({ x: 0, z: 2, heading: 0, inside: 'pip' });
  });
});
