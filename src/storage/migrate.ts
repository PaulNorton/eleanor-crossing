import { CHARACTERS_KEY, type CharacterRepository, LocalStorageCharacterRepository } from './characterRepository';
import type { KeyValueStore } from './keyValue';
import { LocalStorageWorldStateRepository, type WorldStateRepository, playerStateKey } from './worldStateRepository';

/**
 * Moves characters saved in this browser (before the server existed) up to
 * the server, then clears them locally. Characters the server already has
 * are left alone. Returns how many were uploaded.
 */
export async function migrateBrowserData(
  local: KeyValueStore,
  characters: CharacterRepository,
  states: WorldStateRepository,
): Promise<number> {
  if (!local.getItem(CHARACTERS_KEY)) return 0;
  const localCharacters = await new LocalStorageCharacterRepository(local).list();
  const localStates = new LocalStorageWorldStateRepository(local);
  const onServer = new Set((await characters.list()).map((c) => c.id));
  let uploaded = 0;
  for (const c of localCharacters) {
    if (!onServer.has(c.id)) {
      await characters.save(c);
      const state = await localStates.getPlayerState(c.id);
      if (state) await states.setPlayerState(c.id, state);
      uploaded++;
    }
    local.removeItem(playerStateKey(c.id));
  }
  local.removeItem(CHARACTERS_KEY);
  return uploaded;
}
