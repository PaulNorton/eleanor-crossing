import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type Character, normalizeCharacter } from '../src/character/model';
import { type Home, defaultHome, freePlot, normalizeHome } from '../src/home/home';
import { type PlayerState, normalizePlayerState } from '../src/storage/worldStateRepository';
import { PLOT_COUNT } from '../src/world/map';

/** Server-side persistence. A database-backed store can replace the JSON file later. */
export interface GameStore {
  listCharacters(): Promise<Character[]>;
  getCharacter(id: string): Promise<Character | null>;
  putCharacter(character: Character): Promise<void>;
  /** Also removes the character's player state and home. */
  deleteCharacter(id: string): Promise<boolean>;
  getPlayerState(characterId: string): Promise<PlayerState | null>;
  putPlayerState(characterId: string, state: PlayerState): Promise<void>;
  listHomes(): Promise<Home[]>;
  getHome(characterId: string): Promise<Home | null>;
  putHome(home: Home): Promise<void>;
}

interface FileData {
  version: 1;
  characters: Record<string, Character>;
  playerStates: Record<string, PlayerState>;
  homes: Record<string, Home>;
}

/**
 * Keeps everything in memory and writes the whole file after each change.
 * Writes go to a temp file and are renamed into place, so a crash never
 * leaves a half-written file. Writes run one at a time, in order.
 */
export class JsonFileStore implements GameStore {
  private data: FileData = { version: 1, characters: {}, playerStates: {}, homes: {} };
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

  /** Saves a character, giving them a house on the lowest free plot if they have none. */
  async putCharacter(character: Character): Promise<void> {
    this.data.characters[character.id] = character;
    this.ensureHome(character);
    await this.persist();
  }

  async deleteCharacter(id: string): Promise<boolean> {
    if (!this.data.characters[id]) return false;
    delete this.data.characters[id];
    delete this.data.playerStates[id];
    delete this.data.homes[id];
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

  async listHomes(): Promise<Home[]> {
    return Object.values(this.data.homes).sort((a, b) => a.plot - b.plot);
  }

  async getHome(characterId: string): Promise<Home | null> {
    return this.data.homes[characterId] ?? null;
  }

  async putHome(home: Home): Promise<void> {
    this.data.homes[home.characterId] = home;
    await this.persist();
  }

  /** Returns false when every plot is taken. */
  private ensureHome(character: Character): boolean {
    if (this.data.homes[character.id]) return true;
    const plot = freePlot(
      Object.values(this.data.homes).map((h) => h.plot),
      PLOT_COUNT,
    );
    if (plot === null) return false;
    this.data.homes[character.id] = defaultHome(character.id, plot, character.appearance.shirtColor);
    return true;
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
    const takenPlots = new Set<number>();
    for (const [id, value] of Object.entries(raw.homes ?? {})) {
      const plot = (value as Partial<Home>)?.plot;
      if (!this.data.characters[id] || !Number.isInteger(plot) || plot! < 0 || plot! >= PLOT_COUNT || takenPlots.has(plot!)) continue;
      takenPlots.add(plot!);
      this.data.homes[id] = normalizeHome(value, id, plot!);
    }
    // Characters from before houses existed get one now.
    const before = Object.keys(this.data.homes).length;
    for (const c of await this.listCharacters()) this.ensureHome(c);
    if (Object.keys(this.data.homes).length !== before) await this.persist();
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
