# Eleanor Crossing

A cozy island life game in the browser, inspired by Animal Crossing. Built with Three.js, TypeScript, and Vite.

## Run it

```sh
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

### From other devices on your tailnet

```sh
npm run dev:tailnet
```

This binds the server to the machine's Tailscale IP only, so it is not reachable from the local network or the internet. Open `http://<machine>.<tailnet>.ts.net:5173` or `http://<tailscale-ip>:5173` from any device on the tailnet. `npm run preview:tailnet` does the same for the production build.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload. |
| `npm run dev:tailnet` | Start the dev server on the Tailscale IP. |
| `npm run build` | Type-check and build to `dist/`. |
| `npm run preview:tailnet` | Serve the built app on the Tailscale IP. |
| `npm test` | Run unit tests. |
| `npm run typecheck` | Type-check only. |

## Features

**Character creator.** Pick a person or an animal (cat, dog, bunny, bear, fox, frog). Choose skin or fur color, eyes, cheeks, hair, outfit, and hat. Drag the 3D preview to spin it. Save as many residents as you like.

**The island.** Walk around a small island with a plaza, fountain, river, bridge, beach, trees, rocks, and flowers. Six villagers live in their own houses. They wander near home, stop when you come close, and chat when you talk to them. The sky follows your local time of day. The game remembers where you were standing.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys | Joystick, bottom left |
| Run | Hold Shift | Push the joystick all the way |
| Talk / next line | E, Space, or Enter | A button, bottom right |

## Code layout

| Path | Purpose |
| --- | --- |
| `src/character/model.ts` | Character data, options, defaults, and validation. |
| `src/character/build.ts` | Builds the 3D character from its data. |
| `src/scene/stage.ts` | The 3D island scene, camera, and animation. |
| `src/storage/characterRepository.ts` | Saves characters. |
| `src/character/animator.ts` | Idle, walk, wave, and blink animation. |
| `src/ui/creator.ts` | The character creator panel. |
| `src/world/map.ts` | Island layout and collision. Pure data, no rendering. |
| `src/world/npcs.ts` | Villagers and their dialogue. |
| `src/world/scenery.ts` | Builds the island's 3D scenery. |
| `src/world/world.ts` | The island game loop: player, villagers, camera. |
| `src/world/hud.ts` | Dialogue box, talk prompt, minimap, clock, touch controls. |
| `src/world/input.ts` | Keyboard and touch input. |
| `src/storage/worldStateRepository.ts` | Saves where each character is standing. |

## Storage

Characters and their positions live in the browser's `localStorage`. All saves go through the `CharacterRepository` and `WorldStateRepository` interfaces. Its methods are async. To move to a server, write new classes that implement the interfaces with HTTP calls, then pass them in `src/main.ts`. Nothing else needs to change.

Loaded data passes through `normalizeCharacter`, which drops bad records and fills missing fields with defaults. Server responses can use the same function.
