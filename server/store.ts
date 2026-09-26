import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type Character, normalizeCharacter } from '../src/character/model';
import { type PlayerState, normalizePlayerState } from '../src/storage/worldStateRepository';

/** Server-side persistence. A database-backed store can replace the JSON file later. */
export interface GameStore {
  listCharacters(): Promise<Character[]>;
  getCharacter(id: string): Promise<Character | null>;
  putCharacter(character: Character): Promise<void>;
  /** Also removes the character's player state. */
  deleteCharacter(id: string): Promise<boolean>;
  getPlayerState(characterId: string): Promise<PlayerState | null>;
  putPlayerState(characterId: string, state: PlayerState): Promise<void>;
}

interface FileData {
  version: 1;
  characters: Record<string, Character>;
  playerStates: Record<string, PlayerState>;
}

/**
 * Keeps everything in memory and writes the whole file after each change.
 * Writes go to a temp file and are renamed into place, so a crash never
 * leaves a half-written file. Writes run one at a time, in order.
 */
export class JsonFileStore implements GameStore {
  private data: FileData = { version: 1, characters: {}, playerStates: {} };
  private writing: Promise<void> = Promise.resolve();

  private constructor(private readonly path: string) {}

  static async open(path: string): Promise<JsonFileStore> {
    const store = new JsonFileStore(path);
    await store.load();
    return store;
  }

  async listCharacters(): Promise<Character[]> {
    return Object.values(this.data.characters).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getCharacter(id: string): Promise<Character | null> {
    return this.data.characters[id] ?? null;
  }

  async putCharacter(character: Character): Promise<void> {
    this.data.characters[character.id] = character;
    await this.persist();
  }

  async deleteCharacter(id: string): Promise<boolean> {
    if (!this.data.characters[id]) return false;
    delete this.data.characters[id];
    delete this.data.playerStates[id];
    await this.persist();
    return true;
  }

  async getPlayerState(characterId: string): Promise<PlayerState | null> {
    return this.data.playerStates[characterId] ?? null;
  }

  async putPlayerState(characterId: string, state: PlayerState): Promise<void> {
    this.data.playerStates[characterId] = state;
    await this.persist();
  }

  /** Waits for any pending write. */
  flush(): Promise<void> {
    return this.writing;
  }

  private async load(): Promise<void> {
    let text: string;
    try {
      text = await readFile(this.path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    // A corrupt file is an error worth stopping for, not something to silently overwrite.
    const raw = JSON.parse(text) as Partial<FileData>;
    for (const value of Object.values(raw.characters ?? {})) {
      const c = normalizeCharacter(value);
      if (c) this.data.characters[c.id] = c;
    }
    for (const [id, value] of Object.entries(raw.playerStates ?? {})) {
      const s = normalizePlayerState(value);
      if (s && this.data.characters[id]) this.data.playerStates[id] = s;
    }
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 2);
    const write = async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      await writeFile(tmp, snapshot);
      await rename(tmp, this.path);
    };
    this.writing = this.writing.then(write, write);
    return this.writing;
  }
}
