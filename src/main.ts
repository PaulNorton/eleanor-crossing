import './style.css';
import type { Character } from './character/model';
import { Stage } from './scene/stage';
import { LocalStorageCharacterRepository } from './storage/characterRepository';
import { LocalStorageWorldStateRepository } from './storage/worldStateRepository';
import { CharacterCreator } from './ui/creator';
import { VILLAGERS } from './world/npcs';
import { World } from './world/world';

const creatorView = document.getElementById('creator')!;
const worldView = document.getElementById('world')!;
const characters = new LocalStorageCharacterRepository();
const worldState = new LocalStorageWorldStateRepository();
const stage = new Stage(document.getElementById('stage')!);
let world: World | null = null;

const creator = new CharacterCreator(document.getElementById('panel')!, stage, characters, {
  onPlay: (character) => void showWorld(character),
  onDelete: (id) => void worldState.removePlayerState(id),
});

async function showWorld(character: Character): Promise<void> {
  stage.pause();
  creatorView.hidden = true;
  worldView.hidden = false;
  world = await World.create({
    container: worldView,
    character,
    villagers: VILLAGERS,
    stateRepo: worldState,
    onEditCharacter: () => void showCreator(character),
  });
}

async function showCreator(character: Character): Promise<void> {
  await world?.dispose();
  world = null;
  worldView.hidden = true;
  creatorView.hidden = false;
  stage.resume();
  await creator.edit((await characters.get(character.id)) ?? character);
}

async function boot(): Promise<void> {
  await creator.start();
  // Returning players go straight to the island.
  const activeId = await characters.getActiveId();
  const active = activeId ? await characters.get(activeId) : null;
  if (active) await showWorld(active);
}

void boot();
