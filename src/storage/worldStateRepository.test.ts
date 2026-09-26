import { describe, expect, it } from 'vitest';
import { LocalStorageWorldStateRepository, normalizePlayerState } from './worldStateRepository';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('LocalStorageWorldStateRepository', () => {
  it('stores, reads, and removes a position per character', async () => {
    const repo = new LocalStorageWorldStateRepository(memoryStore());
    await repo.setPlayerState('a', { x: 1, z: 2, heading: 3 });
    expect(await repo.getPlayerState('a')).toEqual({ x: 1, z: 2, heading: 3 });
    expect(await repo.getPlayerState('b')).toBeNull();
    await repo.removePlayerState('a');
    expect(await repo.getPlayerState('a')).toBeNull();
  });

  it('ignores corrupt data', async () => {
    const store = memoryStore();
    const repo = new LocalStorageWorldStateRepository(store);
    store.setItem('eleanor-crossing:player-state:a', '{"x":"left"}');
    expect(await repo.getPlayerState('a')).toBeNull();
    store.setItem('eleanor-crossing:player-state:a', 'nope');
    expect(await repo.getPlayerState('a')).toBeNull();
  });
});

describe('normalizePlayerState', () => {
  it('keeps a valid house id and drops a bad one', () => {
    expect(normalizePlayerState({ x: 0, z: 0, heading: 0, inside: 'biscuit' })).toEqual({ x: 0, z: 0, heading: 0, inside: 'biscuit' });
    expect(normalizePlayerState({ x: 0, z: 0, heading: 0, inside: '<script>' })).toEqual({ x: 0, z: 0, heading: 0 });
  });
});
