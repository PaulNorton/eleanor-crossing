import type { IncomingMessage, ServerResponse } from 'node:http';
import { normalizeCharacter } from '../src/character/model';
import { normalizePlayerState } from '../src/storage/worldStateRepository';
import type { GameStore } from './store';

const MAX_BODY_BYTES = 64 * 1024;
const ID = '([A-Za-z0-9-]{1,64})';
const CHARACTERS = /^\/api\/characters\/?$/;
const CHARACTER = new RegExp(`^/api/characters/${ID}$`);
const STATE = new RegExp(`^/api/characters/${ID}/state$`);

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  if (body === undefined) {
    res.end();
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!req.headers['content-type']?.startsWith('application/json')) {
    throw new HttpError(415, 'Send JSON with Content-Type: application/json.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body is too large.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON.');
  }
}

/**
 * Handles /api/* requests. Returns false for any other path so the caller
 * can pass the request on.
 */
export function createApi(store: GameStore) {
  async function route(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    const method = req.method ?? 'GET';
    let m: RegExpMatchArray | null;

    if (CHARACTERS.test(path)) {
      if (method !== 'GET') throw new HttpError(405, 'Method not allowed.');
      return send(res, 200, await store.listCharacters());
    }

    if ((m = path.match(CHARACTER))) {
      const id = m[1];
      if (method === 'GET') {
        const c = await store.getCharacter(id);
        return c ? send(res, 200, c) : send(res, 404, { error: 'No such character.' });
      }
      if (method === 'PUT') {
        const incoming = normalizeCharacter(await readJson(req));
        if (!incoming) throw new HttpError(400, 'That is not a valid character.');
        if (incoming.id !== id) throw new HttpError(400, 'The id in the body does not match the URL.');
        const existing = await store.getCharacter(id);
        const saved = {
          ...incoming,
          createdAt: existing?.createdAt ?? incoming.createdAt,
          updatedAt: new Date().toISOString(),
        };
        await store.putCharacter(saved);
        return send(res, existing ? 200 : 201, saved);
      }
      if (method === 'DELETE') {
        return (await store.deleteCharacter(id)) ? send(res, 204) : send(res, 404, { error: 'No such character.' });
      }
      throw new HttpError(405, 'Method not allowed.');
    }

    if ((m = path.match(STATE))) {
      const id = m[1];
      if (!(await store.getCharacter(id))) return send(res, 404, { error: 'No such character.' });
      if (method === 'GET') {
        // null means the character has not been placed yet.
        return send(res, 200, await store.getPlayerState(id));
      }
      if (method === 'PUT') {
        const state = normalizePlayerState(await readJson(req));
        if (!state) throw new HttpError(400, 'That is not a valid position.');
        await store.putPlayerState(id, state);
        return send(res, 204);
      }
      throw new HttpError(405, 'Method not allowed.');
    }

    throw new HttpError(404, 'Unknown API path.');
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (!path.startsWith('/api/')) return false;
    try {
      await route(req, res, path);
    } catch (err) {
      if (err instanceof HttpError) {
        send(res, err.status, { error: err.message });
      } else {
        console.error(err);
        send(res, 500, { error: 'Something went wrong on the server.' });
      }
    }
    return true;
  };
}
