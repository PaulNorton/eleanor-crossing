import { type Character, normalizeCharacter } from '../character/model';
import { type Home, normalizeHome } from '../home/home';
import type { HomeRepository } from './homeRepository';
import { ACTIVE_KEY, type CharacterRepository } from './characterRepository';
import type { KeyValueStore } from './keyValue';
import { type PlayerState, type WorldStateRepository, normalizePlayerState } from './worldStateRepository';

/** Thrown when the game server cannot be reached or rejects a request. */
export class ServerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

async function request(fetchFn: Fetch, method: string, path: string, body?: unknown): Promise<Response | null> {
  let res: Response;
  try {
    res = await fetchFn(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ServerError('Could not reach the island server.');
  }
  if (res.status === 404 && method === 'GET') return null;
  if (!res.ok) {
    const detail = await res.json().then((j: { error?: string }) => j.error, () => undefined);
    throw new ServerError(detail ?? `The island server answered ${res.status}.`, res.status);
  }
  return res;
}

const characterPath = (id: string) => `/api/characters/${encodeURIComponent(id)}`;

/**
 * Characters live on the server so every device sees them. The active
 * character is a per-device choice, so it stays in this browser.
 */
export class HttpCharacterRepository implements CharacterRepository {
  constructor(
    private readonly local: KeyValueStore = window.localStorage,
    private readonly fetchFn: Fetch = (...args) => fetch(...args),
  ) {}

  async list(): Promise<Character[]> {
    const res = await request(this.fetchFn, 'GET', '/api/characters');
    const raw = (await res?.json()) as unknown;
    return Array.isArray(raw) ? raw.map(normalizeCharacter).filter((c): c is Character => c !== null) : [];
  }

  async get(id: string): Promise<Character | null> {
    const res = await request(this.fetchFn, 'GET', characterPath(id));
    return res ? normalizeCharacter(await res.json()) : null;
  }

  async save(character: Character): Promise<Character> {
    const res = await request(this.fetchFn, 'PUT', characterPath(character.id), character);
    const saved = normalizeCharacter(await res!.json());
    if (!saved) throw new ServerError('The island server sent back a character it could not read.');
    return saved;
  }

  async remove(id: string): Promise<void> {
    try {
      await request(this.fetchFn, 'DELETE', characterPath(id));
    } catch (err) {
      // Already gone is fine.
      if (!(err instanceof ServerError && err.status === 404)) throw err;
    }
    if ((await this.getActiveId()) === id) await this.setActiveId(null);
  }

  async getActiveId(): Promise<string | null> {
    return this.local.getItem(ACTIVE_KEY);
  }

  async setActiveId(id: string | null): Promise<void> {
    if (id === null) this.local.removeItem(ACTIVE_KEY);
    else this.local.setItem(ACTIVE_KEY, id);
  }
}

export class HttpWorldStateRepository implements WorldStateRepository {
  constructor(private readonly fetchFn: Fetch = (...args) => fetch(...args)) {}

  async getPlayerState(characterId: string): Promise<PlayerState | null> {
    const res = await request(this.fetchFn, 'GET', `${characterPath(characterId)}/state`);
    return res ? normalizePlayerState(await res.json()) : null;
  }

  async setPlayerState(characterId: string, state: PlayerState): Promise<void> {
    await request(this.fetchFn, 'PUT', `${characterPath(characterId)}/state`, state);
  }
}

export class HttpHomeRepository implements HomeRepository {
  constructor(private readonly fetchFn: Fetch = (...args) => fetch(...args)) {}

  async list(): Promise<Home[]> {
    const res = await request(this.fetchFn, 'GET', '/api/homes');
    const raw = (await res?.json()) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((h): h is Home => !!h && typeof h.characterId === 'string' && Number.isInteger(h.plot))
      .map((h) => normalizeHome(h, h.characterId, h.plot));
  }

  async save(home: Home): Promise<Home> {
    const res = await request(this.fetchFn, 'PUT', `/api/homes/${encodeURIComponent(home.characterId)}`, home);
    const saved = (await res!.json()) as Home;
    return normalizeHome(saved, home.characterId, saved.plot);
  }
}
