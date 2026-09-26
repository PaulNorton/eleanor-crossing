import { h } from '../ui/dom';
import { type IslandMap, MAP_SIZE, type Point } from './map';
import { tileColor } from './scenery';

const CHARS_PER_SECOND = 45;
const FADE_MS = 250;
const MINIMAP_SCALE = 2;

export interface MinimapDot extends Point {
  color: string;
  player?: boolean;
}

/** On-screen overlay for the island: dialogue, prompts, minimap, clock, and touch controls. */
export class Hud {
  readonly root = h('div', { className: 'hud' });
  readonly joystick = h('div', { className: 'joystick', ariaLabel: 'Move' });
  readonly knob = h('div', { className: 'knob' });
  readonly actionButton = h('button', { className: 'action-button' }, 'A');
  readonly editButton = h('button', { className: 'edit-button' }, '✏️ Edit character');
  readonly decorateButton = h('button', { className: 'decorate-button', hidden: true }, '🛠 Decorate');

  private readonly playerChip = h('div', { className: 'player-chip' });
  private readonly clock = h('div', { className: 'clock' });
  private readonly minimap = h('canvas', { className: 'minimap', width: MAP_SIZE * MINIMAP_SCALE, height: MAP_SIZE * MINIMAP_SCALE });
  private readonly minimapBase = document.createElement('canvas');
  private readonly prompt = h('div', { className: 'talk-prompt', hidden: true });
  private readonly fadeEl = h('div', { className: 'fade' });
  private readonly dialogue = h('div', { className: 'dialogue', hidden: true, role: 'dialog' } as Partial<HTMLDivElement>);
  private readonly dialogueName = h('div', { className: 'dialogue-name' });
  private readonly dialogueText = h('p', { className: 'dialogue-text' });
  private readonly dialogueNext = h('div', { className: 'dialogue-next' }, '▼');

  private lines: string[] = [];
  private lineIndex = 0;
  private shownChars = 0;

  constructor(map: IslandMap, houseColors: Map<string, string>) {
    this.joystick.append(this.knob);
    this.dialogue.append(this.dialogueName, this.dialogueText, this.dialogueNext);
    this.root.append(
      h('div', { className: 'hud-top-left' }, this.playerChip, this.editButton, this.decorateButton),
      h('div', { className: 'hud-top-right' }, this.minimap, this.clock),
      this.prompt,
      this.dialogue,
      h('div', { className: 'controls-hint' }, 'WASD / arrows: move · Shift: run · E: talk'),
      this.joystick,
      this.actionButton,
      this.fadeEl,
    );
    this.drawMinimapBase(map, houseColors);
  }

  /** Redraws the minimap's houses, e.g. after a roof changes color. */
  setHouseColors(map: IslandMap, houseColors: Map<string, string>): void {
    this.drawMinimapBase(map, houseColors);
  }

  setPlayer(label: string): void {
    this.playerChip.textContent = label;
  }

  setClock(date: Date): void {
    this.clock.textContent = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  /** Shows the talk prompt at a screen position, or hides it when `at` is null. */
  showPrompt(text: string, at: { x: number; y: number } | null): void {
    this.prompt.hidden = at === null;
    if (!at) return;
    this.prompt.textContent = text;
    this.prompt.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -100%)`;
  }

  /** Fades the screen to black (true) or back (false). Resolves when done. */
  fade(toBlack: boolean): Promise<void> {
    this.fadeEl.classList.toggle('on', toBlack);
    return new Promise((done) => window.setTimeout(done, FADE_MS));
  }

  get dialogueOpen(): boolean {
    return !this.dialogue.hidden;
  }

  openDialogue(name: string, color: string, lines: string[]): void {
    this.lines = lines;
    this.lineIndex = 0;
    this.shownChars = 0;
    this.dialogueName.textContent = name;
    this.dialogueName.style.background = color;
    this.dialogue.hidden = false;
    this.actionButton.textContent = '▼';
    this.renderLine();
  }

  /** Finishes the current line, or moves to the next. Returns false once the dialogue closes. */
  advanceDialogue(): boolean {
    const line = this.lines[this.lineIndex];
    if (this.shownChars < line.length) {
      this.shownChars = line.length;
    } else if (this.lineIndex < this.lines.length - 1) {
      this.lineIndex++;
      this.shownChars = 0;
    } else {
      this.dialogue.hidden = true;
      this.actionButton.textContent = 'A';
      return false;
    }
    this.renderLine();
    return true;
  }

  update(dt: number): void {
    if (!this.dialogueOpen) return;
    const line = this.lines[this.lineIndex];
    if (this.shownChars < line.length) {
      this.shownChars = Math.min(line.length, this.shownChars + dt * CHARS_PER_SECOND);
      this.renderLine();
    }
  }

  drawMinimap(dots: MinimapDot[]): void {
    const ctx = this.minimap.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(this.minimapBase, 0, 0);
    const half = MAP_SIZE / 2;
    for (const dot of dots) {
      ctx.beginPath();
      ctx.arc((dot.x + half) * MINIMAP_SCALE, (dot.z + half) * MINIMAP_SCALE, dot.player ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = dot.color;
      ctx.fill();
      ctx.lineWidth = dot.player ? 2 : 1;
      ctx.strokeStyle = dot.player ? '#2b2b2b' : '#ffffff';
      ctx.stroke();
    }
  }

  private renderLine(): void {
    const line = this.lines[this.lineIndex];
    this.dialogueText.textContent = line.slice(0, Math.floor(this.shownChars));
    this.dialogueNext.style.visibility = this.shownChars >= line.length ? 'visible' : 'hidden';
  }

  private drawMinimapBase(map: IslandMap, houseColors: Map<string, string>): void {
    const s = MINIMAP_SCALE;
    this.minimapBase.width = this.minimap.width;
    this.minimapBase.height = this.minimap.height;
    const ctx = this.minimapBase.getContext('2d');
    if (!ctx) return;
    for (let tz = 0; tz < MAP_SIZE; tz++) {
      for (let tx = 0; tx < MAP_SIZE; tx++) {
        const prop = map.props.get(map.index(tx, tz));
        ctx.fillStyle = prop === 'tree' ? '#3e8e41' : prop === 'rock' ? '#9aa0a6' : tileColor(map.tileAt(tx, tz), tx, tz);
        ctx.fillRect(tx * s, tz * s, s, s);
      }
    }
    for (const house of [...map.houses, ...map.plots]) {
      ctx.fillStyle = houseColors.get(house.owner) ?? '#c0392b';
      ctx.fillRect(house.tx * s, house.tz * s, 3 * s, 3 * s);
    }
  }
}
