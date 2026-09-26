/** Where a character was standing when they last left the island. */
export interface PlayerState {
  x: number;
  z: number;
  heading: number;
}

/** Async for the same reason as CharacterRepository: a server can replace it. */
export interface WorldStateRepository {
  getPlayerState(characterId: string): Promise<PlayerState | null>;
  setPlayerState(characterId: string, state: PlayerState): Promise<void>;
  removePlayerState(characterId: string): Promise<void>;
}

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const key = (characterId: string) => `eleanor-crossing:player-state:${characterId}`;

export class LocalStorageWorldStateRepository implements WorldStateRepository {
  constructor(private readonly store: KeyValueStore = window.localStorage) {}

  async getPlayerState(characterId: string): Promise<PlayerState | null> {
    const raw = this.store.getItem(key(characterId));
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as Record<string, unknown>;
      const ok = [s.x, s.z, s.heading].every((n) => typeof n === 'number' && Number.isFinite(n));
      return ok ? { x: s.x as number, z: s.z as number, heading: s.heading as number } : null;
    } catch {
      return null;
    }
  }

  async setPlayerState(characterId: string, state: PlayerState): Promise<void> {
    this.store.setItem(key(characterId), JSON.stringify(state));
  }

  async removePlayerState(characterId: string): Promise<void> {
    this.store.removeItem(key(characterId));
  }
}
