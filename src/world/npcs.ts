import { type Appearance, defaultAppearance } from '../character/model';

export type Personality = 'cheerful' | 'lazy' | 'grumpy' | 'smart' | 'sporty' | 'sweet';

export interface Villager {
  id: string;
  name: string;
  personality: Personality;
  catchphrase: string;
  /** Roof color of their house, also used for their name tag. */
  color: string;
  appearance: Appearance;
  /** Lines they may say. `{player}` becomes the player's name. */
  lines: string[];
}

function look(overrides: Partial<Appearance>): Appearance {
  return { ...defaultAppearance(), hairStyle: 'none', ...overrides };
}

export const VILLAGERS: readonly Villager[] = [
  {
    id: 'biscuit',
    name: 'Biscuit',
    personality: 'cheerful',
    catchphrase: 'woof-woof',
    color: '#e67e22',
    appearance: look({ species: 'dog', bodyColor: '#d9b38c', shirtColor: '#f1c40f', pantsColor: '#3498db', hat: 'cap', hatColor: '#e74c3c' }),
    lines: [
      'Have you seen the fountain sparkle at noon? It is the best part of my day!',
      "I tried to dig up a bone by the river. Turned out to be a rock. Still fun!",
      'You should visit everyone today. They all love visitors!',
    ],
  },
  {
    id: 'juniper',
    name: 'Juniper',
    personality: 'smart',
    catchphrase: 'mrrp',
    color: '#8e44ad',
    appearance: look({ species: 'cat', bodyColor: '#9aa0a6', eyeStyle: 'sleepy', shirtColor: '#9b59b6', pantsColor: '#34495e', blush: false }),
    lines: [
      'I counted every tree on this island. Then I lost count. Then I counted again.',
      'The river runs north to south. I checked with a leaf.',
      'A good book and a quiet bench. That is all I need, {player}.',
    ],
  },
  {
    id: 'pip',
    name: 'Pip',
    personality: 'lazy',
    catchphrase: 'ribbit',
    color: '#27ae60',
    appearance: look({ species: 'frog', eyeStyle: 'happy', shirtColor: '#ff8fb1', pantsColor: '#f1c40f' }),
    lines: [
      'I was going to do something today. Then I had a snack instead.',
      'Rain is the best weather. Nobody asks you to go anywhere.',
      'If you find any bugs, do not tell me. I might have to get up.',
    ],
  },
  {
    id: 'hazel',
    name: 'Hazel',
    personality: 'grumpy',
    catchphrase: 'hmph',
    color: '#795548',
    appearance: look({ species: 'bear', bodyColor: '#8b5e3c', eyeStyle: 'sleepy', shirtColor: '#2ecc71', pantsColor: '#34495e', hat: 'beanie', hatColor: '#e74c3c' }),
    lines: [
      'Keep off my flowers. ...Fine, you can look at them.',
      'Too many visitors lately. Not you. You are fine. Mostly.',
      'Back in my day, this island had one tree. And we liked it.',
    ],
  },
  {
    id: 'rusty',
    name: 'Rusty',
    personality: 'sporty',
    catchphrase: 'yip yip',
    color: '#c0392b',
    appearance: look({ species: 'fox', eyeStyle: 'sparkle', shirtColor: '#ffffff', pantsColor: '#e74c3c', shoeColor: '#ffffff' }),
    lines: [
      'I ran around the whole island twice before breakfast!',
      'Race you to the bridge, {player}! ...Okay, I already won.',
      'Stretch first. Always stretch first.',
    ],
  },
  {
    id: 'clover',
    name: 'Clover',
    personality: 'sweet',
    catchphrase: 'hop hop',
    color: '#ff8fb1',
    appearance: look({ species: 'bunny', eyeStyle: 'sparkle', shirtColor: '#ff8fb1', pantsColor: '#ffffff', hat: 'flower', hatColor: '#f7c6d9' }),
    lines: [
      'I picked these flowers for you! ...Oh, I dropped them somewhere.',
      'The island feels brighter since you moved in, {player}.',
      'Do you think the fish in the river have names?',
    ],
  },
];

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

const GREETINGS: Record<DayPart, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  night: "Oh! You're up late",
};

/**
 * A short conversation: a greeting, then one line from the villager's pool.
 * At home, they welcome you in instead of the usual greeting.
 */
export function conversation(
  v: Villager,
  playerName: string,
  hour: number,
  rand: () => number = Math.random,
  atHome = false,
): string[] {
  const line = v.lines[Math.floor(rand() * v.lines.length)];
  const greeting = atHome ? `Welcome to my place, ${playerName}` : `${GREETINGS[dayPart(hour)]}, ${playerName}`;
  return [
    `${greeting}, ${v.catchphrase}!`,
    line.replaceAll('{player}', playerName),
  ];
}
