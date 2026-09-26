import {
  type Appearance,
  type Character,
  DEFAULT_BODY_COLOR,
  EYE_STYLES,
  HAIR_STYLES,
  HATS,
  LABELS,
  NAME_MAX_LENGTH,
  PALETTES,
  SPECIES,
  type Species,
  createCharacter,
  defaultAppearance,
  randomAppearance,
  validateName,
} from '../character/model';
import type { Stage } from '../scene/stage';
import { h } from './dom';
import type { CharacterRepository } from '../storage/characterRepository';

const SPECIES_ICONS: Record<Species, string> = {
  human: '🧑',
  cat: '🐱',
  dog: '🐶',
  bunny: '🐰',
  bear: '🐻',
  fox: '🦊',
  frog: '🐸',
};

const TABS = ['Species', 'Face', 'Hair', 'Outfit', 'Hat'] as const;
type Tab = (typeof TABS)[number];

type ColorKey = { [K in keyof Appearance]: Appearance[K] extends string ? K : never }[keyof Appearance];

export interface CreatorEvents {
  /** The player saved a character and wants to go to the island. */
  onPlay(character: Character): void;
  onDelete(characterId: string): void;
}

/** The character creation panel. Owns the in-progress character and syncs it to the stage. */
export class CharacterCreator {
  private appearance: Appearance = defaultAppearance();
  private name = '';
  private editing: Character | null = null;
  private characters: Character[] = [];
  private tab: Tab = 'Species';

  private readonly residentsEl = h('div', { className: 'residents' });
  private readonly nameInput = h('input', {
    id: 'name',
    type: 'text',
    maxLength: NAME_MAX_LENGTH,
    placeholder: 'Your name',
    autocomplete: 'off',
  });
  private readonly nameError = h('p', { className: 'error', role: 'alert' } as Partial<HTMLParagraphElement>);
  private readonly tabsEl = h('div', { className: 'tabs', role: 'tablist' } as Partial<HTMLDivElement>);
  private readonly optionsEl = h('div', { className: 'options' });
  private readonly saveButton = h('button', { className: 'primary' }, 'Save');
  private readonly deleteButton = h('button', { className: 'danger', title: 'Delete character', ariaLabel: 'Delete character' }, '🗑');
  private readonly toast = h('div', { className: 'toast', role: 'status' } as Partial<HTMLDivElement>);

  constructor(
    private readonly root: HTMLElement,
    private readonly stage: Stage,
    private readonly repo: CharacterRepository,
    private readonly events: CreatorEvents,
  ) {}

  async start(): Promise<void> {
    this.render();
    this.characters = await this.repo.list();
    const activeId = await this.repo.getActiveId();
    const active = this.characters.find((c) => c.id === activeId);
    if (active) this.load(active);
    else this.startNew();
  }

  /** Reopens the creator on an existing character, e.g. when returning from the island. */
  async edit(character: Character): Promise<void> {
    this.characters = await this.repo.list();
    this.load(character);
  }

  private render(): void {
    this.nameInput.addEventListener('input', () => {
      this.name = this.nameInput.value;
      this.nameError.textContent = '';
    });

    const randomButton = h('button', { title: 'Random look' }, '🎲 Random');
    randomButton.addEventListener('click', () => {
      this.appearance = randomAppearance();
      this.refresh();
    });
    this.saveButton.addEventListener('click', () => void this.save());
    this.deleteButton.addEventListener('click', () => void this.remove());

    for (const tab of TABS) {
      const button = h('button', { role: 'tab' } as Partial<HTMLButtonElement>, tab);
      button.addEventListener('click', () => {
        this.tab = tab;
        this.refresh();
      });
      this.tabsEl.append(button);
    }

    this.root.append(
      h('header', {}, h('h1', {}, 'Eleanor Crossing'), h('p', { className: 'tagline' }, 'Create your island resident')),
      this.residentsEl,
      h('label', { className: 'field-label', htmlFor: 'name' }, 'Name'),
      this.nameInput,
      this.nameError,
      this.tabsEl,
      this.optionsEl,
      h('footer', {}, randomButton, this.deleteButton, this.saveButton),
      this.toast,
    );
  }

  private startNew(): void {
    this.editing = null;
    this.name = '';
    this.appearance = defaultAppearance();
    this.tab = 'Species';
    this.refresh();
    this.nameInput.focus();
  }

  private load(character: Character): void {
    this.editing = character;
    this.name = character.name;
    this.appearance = { ...character.appearance };
    this.refresh();
  }

  private async save(): Promise<void> {
    const error = validateName(this.name);
    if (error) {
      this.nameError.textContent = error;
      this.nameInput.focus();
      return;
    }
    const character = this.editing
      ? { ...this.editing, name: this.name.trim(), appearance: { ...this.appearance } }
      : createCharacter(this.name, this.appearance);
    const saved = await this.repo.save(character);
    await this.repo.setActiveId(saved.id);
    this.characters = await this.repo.list();
    this.editing = saved;
    this.refresh();
    this.events.onPlay(saved);
  }

  private async remove(): Promise<void> {
    if (!this.editing) return;
    if (!confirm(`Delete ${this.editing.name}? This cannot be undone.`)) return;
    await this.repo.remove(this.editing.id);
    this.events.onDelete(this.editing.id);
    this.characters = await this.repo.list();
    this.showToast(`${this.editing.name} moved away.`);
    this.startNew();
  }

  private showToast(message: string): void {
    this.toast.textContent = message;
    this.toast.classList.add('visible');
    window.setTimeout(() => this.toast.classList.remove('visible'), 2500);
  }

  /** Re-renders everything that depends on state and updates the 3D model. */
  private refresh(): void {
    this.stage.setAppearance(this.appearance);
    this.nameInput.value = this.name;
    this.nameError.textContent = '';
    this.deleteButton.hidden = this.editing === null;
    this.saveButton.textContent = this.editing ? 'Save & play ▶' : 'Move in! ▶';
    this.renderResidents();
    this.tabsEl.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-selected', String(b.textContent === this.tab));
    });
    this.optionsEl.replaceChildren(...this.renderTab());
  }

  private renderResidents(): void {
    const chips = this.characters.map((c) => {
      const chip = h('button', { className: 'chip' }, `${SPECIES_ICONS[c.appearance.species]} ${c.name}`);
      chip.setAttribute('aria-pressed', String(c.id === this.editing?.id));
      chip.addEventListener('click', () => {
        this.load(c);
        void this.repo.setActiveId(c.id);
      });
      return chip;
    });
    const newChip = h('button', { className: 'chip new' }, '＋ New');
    newChip.setAttribute('aria-pressed', String(this.editing === null));
    newChip.addEventListener('click', () => this.startNew());
    this.residentsEl.replaceChildren(...chips, newChip);
  }

  private renderTab(): HTMLElement[] {
    const a = this.appearance;
    const isHuman = a.species === 'human';
    switch (this.tab) {
      case 'Species':
        return [this.speciesPicker()];
      case 'Face':
        return [
          this.colorRow(isHuman ? 'Skin' : 'Fur', 'bodyColor', isHuman ? PALETTES.skin : PALETTES.fur),
          this.choiceRow('Eyes', EYE_STYLES, a.eyeStyle, (v) => (a.eyeStyle = v)),
          this.colorRow('Eye color', 'eyeColor', PALETTES.eyes),
          this.choiceRow('Rosy cheeks', ['yes', 'no'] as const, a.blush ? 'yes' : 'no', (v) => (a.blush = v === 'yes')),
        ];
      case 'Hair':
        return [
          this.choiceRow('Style', HAIR_STYLES, a.hairStyle, (v) => (a.hairStyle = v)),
          this.colorRow('Color', 'hairColor', PALETTES.hair),
        ];
      case 'Outfit':
        return [
          this.colorRow('Shirt', 'shirtColor', PALETTES.clothes),
          this.colorRow('Pants', 'pantsColor', PALETTES.clothes),
          this.colorRow('Shoes', 'shoeColor', PALETTES.clothes),
        ];
      case 'Hat':
        return [
          this.choiceRow('Style', HATS, a.hat, (v) => (a.hat = v)),
          this.colorRow('Color', 'hatColor', PALETTES.clothes),
        ];
    }
  }

  private speciesPicker(): HTMLElement {
    const grid = h('div', { className: 'species-grid' });
    for (const species of SPECIES) {
      const button = h(
        'button',
        { className: 'species' },
        h('span', { className: 'icon' }, SPECIES_ICONS[species]),
        h('span', {}, LABELS[species]),
      );
      button.setAttribute('aria-pressed', String(species === this.appearance.species));
      button.addEventListener('click', () => this.setSpecies(species));
      grid.append(button);
    }
    return grid;
  }

  private setSpecies(species: Species): void {
    const a = this.appearance;
    if (species === a.species) return;
    const wasHuman = a.species === 'human';
    a.species = species;
    a.bodyColor = DEFAULT_BODY_COLOR[species];
    // People start with hair and animals start without; the player can change either.
    if (species === 'human' && a.hairStyle === 'none') a.hairStyle = 'short';
    if (species !== 'human' && wasHuman) a.hairStyle = 'none';
    this.refresh();
  }

  private choiceRow<T extends string>(
    label: string,
    options: readonly T[],
    selected: T,
    onPick: (value: T) => void,
  ): HTMLElement {
    const row = h('div', { className: 'choices' });
    for (const option of options) {
      const text = option in LABELS ? LABELS[option as keyof typeof LABELS] : option[0].toUpperCase() + option.slice(1);
      const button = h('button', { className: 'choice' }, text);
      button.setAttribute('aria-pressed', String(option === selected));
      button.addEventListener('click', () => {
        onPick(option);
        this.refresh();
      });
      row.append(button);
    }
    return h('section', {}, h('h2', {}, label), row);
  }

  private colorRow(label: string, key: ColorKey, palette: readonly string[]): HTMLElement {
    const a = this.appearance;
    const current = a[key].toLowerCase();
    const row = h('div', { className: 'swatches' });
    for (const color of palette) {
      const swatch = h('button', { className: 'swatch', title: color });
      swatch.style.background = color;
      swatch.setAttribute('aria-label', `${label} ${color}`);
      swatch.setAttribute('aria-pressed', String(color.toLowerCase() === current));
      swatch.addEventListener('click', () => {
        a[key] = color as never;
        this.refresh();
      });
      row.append(swatch);
    }
    const custom = h('input', { type: 'color', value: current, title: 'Custom color', className: 'custom-color' });
    custom.setAttribute('aria-label', `Custom ${label.toLowerCase()} color`);
    custom.setAttribute('aria-pressed', String(!palette.some((c) => c.toLowerCase() === current)));
    // Update the model live while dragging, but only rebuild the panel when the picker closes.
    custom.addEventListener('input', () => {
      a[key] = custom.value as never;
      this.stage.setAppearance(a);
    });
    custom.addEventListener('change', () => this.refresh());
    row.append(custom);
    return h('section', {}, h('h2', {}, label), row);
  }
}
