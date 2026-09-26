import { type Character, normalizeCharacter } from '../character/model';
import type { KeyValueStore } from './keyValue';

/** Persistence boundary for characters. */
export interface CharacterRepository {
  list(): Promise<Character[]>;
  get(id: string): Promise<Character | null>;
  save(character: Character): Promise<Character>;
  remove(id: string): Promise<void>;
  getActiveId(): Promise<string | null>;
  setActiveId(id: string | null): Promise<void>;
}

export const CHARACTERS_KEY = 'eleanor-crossing:characters';
export const ACTIVE_KEY = 'eleanor-crossing:active-character';

/** Browser-only storage. Kept to migrate data saved before the server existed. */
export class LocalStorageCharacterRepository implements CharacterRepository {
  constructor(private readonly store: KeyValueStore = window.localStorage) {}

  async list(): Promise<Character[]> {
    return this.readAll().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async get(id: string): Promise<Character | null> {
    return this.readAll().find((c) => c.id === id) ?? null;
  }

  async save(character: Character): Promise<Character> {
    const saved: Character = { ...character, updatedAt: new Date().toISOString() };
    const all = this.readAll();
    const index = all.findIndex((c) => c.id === saved.id);
    if (index === -1) all.push(saved);
    else all[index] = saved;
    this.writeAll(all);
    return saved;
  }

  async remove(id: string): Promise<void> {
    this.writeAll(this.readAll().filter((c) => c.id !== id));
    if ((await this.getActiveId()) === id) await this.setActiveId(null);
  }

  async getActiveId(): Promise<string | null> {
    return this.store.getItem(ACTIVE_KEY);
  }

  async setActiveId(id: string | null): Promise<void> {
    if (id === null) this.store.removeItem(ACTIVE_KEY);
    else this.store.setItem(ACTIVE_KEY, id);
  }

  private readAll(): Character[] {
    const raw = this.store.getItem(CHARACTERS_KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeCharacter).filter((c): c is Character => c !== null);
    } catch {
      return [];
    }
  }

  private writeAll(characters: Character[]): void {
    this.store.setItem(CHARACTERS_KEY, JSON.stringify(characters));
  }
}
