import './style.css';
import { Stage } from './scene/stage';
import { LocalStorageCharacterRepository } from './storage/characterRepository';
import { CharacterCreator } from './ui/creator';

const stage = new Stage(document.getElementById('stage')!);
const repo = new LocalStorageCharacterRepository();
void new CharacterCreator(document.getElementById('panel')!, stage, repo).start();
