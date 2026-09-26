import type { KeyValueStore } from './keyValue';

/** Where a character was standing when they last left the island. */
export interface PlayerState {
  x: number;
  z: number;
  heading: number;
}

export interface WorldStateRepository {
  getPlayerState(characterId: string): Promise<PlayerState | null>;
  setPlayerState(characterId: string, state: PlayerState): Promise<void>;
}

/** Coerces untrusted data into a PlayerState, or returns null if it is unusable. */
export function normalizePlayerState(raw: unknown): PlayerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const ok = [s.x, s.z, s.heading].every((n) => typeof n === 'number' && Number.isFinite(n));
  return ok ? { x: s.x as number, z: s.z as number, heading: s.heading as number } : null;
}

export const playerStateKey = (characterId: string) => `eleanor-crossing:player-state:${characterId}`;

/** Browser-only storage. Kept to migrate data saved before the server existed. */
export class LocalStorageWorldStateRepository implements WorldStateRepository {
  constructor(private readonly store: KeyValueStore = window.localStorage) {}

  async getPlayerState(characterId: string): Promise<PlayerState | null> {
    const raw = this.store.getItem(playerStateKey(characterId));
    if (!raw) return null;
    try {
      return normalizePlayerState(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async setPlayerState(characterId: string, state: PlayerState): Promise<void> {
    this.store.setItem(playerStateKey(characterId), JSON.stringify(state));
  }

  async removePlayerState(characterId: string): Promise<void> {
    this.store.removeItem(playerStateKey(characterId));
  }
}
