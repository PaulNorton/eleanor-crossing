import { CATALOG, FLOOR_STYLES, type FloorStyle, HOME_PALETTE, type Home, MAX_FURNITURE } from '../home/home';
import { h } from '../ui/dom';
import type { FurnitureKind } from './interior';

const TABS = ['Furniture', 'Room', 'Outside'] as const;
type Tab = (typeof TABS)[number];

const FLOOR_LABELS: Record<FloorStyle, string> = { wood: 'Wood', tile: 'Tile', checker: 'Checker', carpet: 'Carpet' };

export interface DecorateEvents {
  add(kind: FurnitureKind): void;
  rotate(): void;
  move(): void;
  remove(): void;
  recolor(color: string): void;
  deselect(): void;
  room(change: Partial<Home['interior']>): void;
  outside(change: Partial<Home['exterior']>): void;
  done(): void;
}

/** The side panel (a bottom sheet on phones) for decorating your own house. */
export class DecoratePanel {
  readonly root = h('aside', { className: 'decorate-panel', ariaLabel: 'Decorate' });
  private readonly body = h('div', { className: 'decorate-body' });
  private readonly tabsEl = h('div', { className: 'tabs', role: 'tablist' } as Partial<HTMLDivElement>);
  private readonly hint = h('p', { className: 'decorate-hint', role: 'status' } as Partial<HTMLParagraphElement>);
  private tab: Tab = 'Furniture';
  private home: Home | null = null;
  private selectedIndex: number | null = null;
  private placing = false;

  constructor(private readonly events: DecorateEvents) {
    for (const tab of TABS) {
      const button = h('button', { role: 'tab' } as Partial<HTMLButtonElement>, tab);
      button.addEventListener('click', () => {
        this.tab = tab;
        this.render();
      });
      this.tabsEl.append(button);
    }
    const done = h('button', { className: 'primary' }, 'Done');
    done.addEventListener('click', () => events.done());
    this.root.append(
      h('header', { className: 'decorate-header' }, h('h2', {}, '🛠 Decorate'), done),
      this.tabsEl,
      this.hint,
      this.body,
    );
    this.root.hidden = true;
  }

  open(home: Home): void {
    this.home = home;
    this.selectedIndex = null;
    this.placing = false;
    this.tab = 'Furniture';
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
  }

  /** Call after any change so the panel reflects the current house and selection. */
  update(home: Home, selectedIndex: number | null, placing: boolean): void {
    this.home = home;
    this.selectedIndex = selectedIndex;
    this.placing = placing;
    this.render();
  }

  setHint(text: string): void {
    this.hint.textContent = text;
  }

  private render(): void {
    const home = this.home;
    if (!home) return;
    this.tabsEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.textContent === this.tab)));
    this.body.replaceChildren(...this.renderTab(home));
    if (this.placing) this.setHint('Tap the floor to put it down. R turns it. Esc cancels.');
    else if (this.selectedIndex !== null) this.setHint('Change it below, or tap another piece.');
    else if (this.tab === 'Furniture') this.setHint('Pick something to add, or tap a piece in the room to change it.');
    else if (this.tab === 'Outside') this.setHint('Step outside to see these colors.');
    else this.setHint('');
  }

  private renderTab(home: Home): HTMLElement[] {
    switch (this.tab) {
      case 'Furniture':
        return this.selectedIndex !== null && !this.placing ? this.selectedControls(home) : [this.catalog(home)];
      case 'Room':
        return [
          this.swatches('Wallpaper', home.interior.wallpaper, (c) => this.events.room({ wallpaper: c })),
          this.choices('Floor', FLOOR_STYLES, home.interior.floorStyle, (v) => this.events.room({ floorStyle: v })),
          this.swatches('Floor color', home.interior.floorColor, (c) => this.events.room({ floorColor: c })),
        ];
      case 'Outside':
        return [
          this.swatches('Roof', home.exterior.roof, (c) => this.events.outside({ roof: c })),
          this.swatches('Walls', home.exterior.walls, (c) => this.events.outside({ walls: c })),
          this.swatches('Door', home.exterior.door, (c) => this.events.outside({ door: c })),
        ];
    }
  }

  private catalog(home: Home): HTMLElement {
    const full = home.interior.furniture.length >= MAX_FURNITURE;
    const grid = h('div', { className: 'catalog' });
    for (const entry of CATALOG) {
      const button = h('button', { className: 'catalog-item', disabled: full }, h('span', { className: 'icon' }, entry.icon), entry.label);
      button.addEventListener('click', () => this.events.add(entry.kind));
      grid.append(button);
    }
    const note = full ? `Your house is full (${MAX_FURNITURE} pieces). Remove something first.` : `${home.interior.furniture.length} of ${MAX_FURNITURE} pieces`;
    return h('section', {}, h('h3', {}, 'Add furniture'), grid, h('p', { className: 'decorate-note' }, note));
  }

  private selectedControls(home: Home): HTMLElement[] {
    const piece = home.interior.furniture[this.selectedIndex!];
    const entry = CATALOG.find((c) => c.kind === piece.kind)!;
    const actions = h('div', { className: 'choices' });
    const action = (label: string, fn: () => void, className = '') => {
      const b = h('button', { className }, label);
      b.addEventListener('click', fn);
      actions.append(b);
    };
    action('↻ Turn', () => this.events.rotate());
    action('✥ Move', () => this.events.move());
    action('🗑 Put away', () => this.events.remove(), 'danger');
    action('✓ Done', () => this.events.deselect());
    return [
      h('section', {}, h('h3', {}, `${entry.icon} ${entry.label}`), actions),
      this.swatches('Color', piece.color ?? '', (c) => this.events.recolor(c)),
    ];
  }

  private swatches(label: string, current: string, pick: (color: string) => void): HTMLElement {
    const row = h('div', { className: 'swatches' });
    for (const color of HOME_PALETTE) {
      const swatch = h('button', { className: 'swatch', title: color });
      swatch.style.background = color;
      swatch.setAttribute('aria-label', `${label} ${color}`);
      swatch.setAttribute('aria-pressed', String(color === current.toLowerCase()));
      swatch.addEventListener('click', () => pick(color));
      row.append(swatch);
    }
    const custom = h('input', { type: 'color', value: current || '#ffffff', className: 'custom-color', title: 'Custom color' });
    custom.setAttribute('aria-label', `Custom ${label.toLowerCase()} color`);
    custom.addEventListener('change', () => pick(custom.value));
    row.append(custom);
    return h('section', {}, h('h3', {}, label), row);
  }

  private choices<T extends string>(label: string, options: readonly T[], current: T, pick: (v: T) => void): HTMLElement {
    const row = h('div', { className: 'choices' });
    for (const option of options) {
      const b = h('button', { className: 'choice' }, FLOOR_LABELS[option as FloorStyle] ?? option);
      b.setAttribute('aria-pressed', String(option === current));
      b.addEventListener('click', () => pick(option));
      row.append(b);
    }
    return h('section', {}, h('h3', {}, label), row);
  }
}
