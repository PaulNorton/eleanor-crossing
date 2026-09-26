import { beforeEach, describe, expect, it } from 'vitest';
import { createCharacter, defaultAppearance } from '../character/model';
import { LocalStorageCharacterRepository } from './characterRepository';

class MemoryStore {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

describe('LocalStorageCharacterRepository', () => {
  let store: MemoryStore;
  let repo: LocalStorageCharacterRepository;

  beforeEach(() => {
    store = new MemoryStore();
    repo = new LocalStorageCharacterRepository(store);
  });

  it('starts empty', async () => {
    expect(await repo.list()).toEqual([]);
    expect(await repo.getActiveId()).toBeNull();
  });

  it('saves, reads back, and updates a character', async () => {
    const c = createCharacter('Eleanor', defaultAppearance());
    await repo.save(c);
    expect((await repo.get(c.id))?.name).toBe('Eleanor');

    await repo.save({ ...c, name: 'Nell' });
    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Nell');
  });

  it('persists across repository instances', async () => {
    const c = createCharacter('Eleanor', defaultAppearance());
    await repo.save(c);
    await repo.setActiveId(c.id);
    const fresh = new LocalStorageCharacterRepository(store);
    expect(await fresh.get(c.id)).not.toBeNull();
    expect(await fresh.getActiveId()).toBe(c.id);
  });

  it('removes a character and clears it as active', async () => {
    const c = createCharacter('Eleanor', defaultAppearance());
    await repo.save(c);
    await repo.setActiveId(c.id);
    await repo.remove(c.id);
    expect(await repo.list()).toEqual([]);
    expect(await repo.getActiveId()).toBeNull();
  });

  it('ignores corrupt storage', async () => {
    store.setItem('eleanor-crossing:characters', '{not json');
    expect(await repo.list()).toEqual([]);
    store.setItem('eleanor-crossing:characters', JSON.stringify([{ bogus: true }]));
    expect(await repo.list()).toEqual([]);
  });
});
