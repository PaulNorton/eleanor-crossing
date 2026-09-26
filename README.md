# Eleanor Crossing

A cozy island life game in the browser, inspired by Animal Crossing. Built with Three.js, TypeScript, and Vite.

## Run it

```sh
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload. |
| `npm run build` | Type-check and build to `dist/`. |
| `npm test` | Run unit tests. |
| `npm run typecheck` | Type-check only. |

## Features

**Character creator.** Pick a person or an animal (cat, dog, bunny, bear, fox, frog). Choose skin or fur color, eyes, cheeks, hair, outfit, and hat. Drag the 3D preview to spin it. Save as many residents as you like.

## Code layout

| Path | Purpose |
| --- | --- |
| `src/character/model.ts` | Character data, options, defaults, and validation. |
| `src/character/build.ts` | Builds the 3D character from its data. |
| `src/scene/stage.ts` | The 3D island scene, camera, and animation. |
| `src/storage/characterRepository.ts` | Saves characters. |
| `src/ui/creator.ts` | The character creator panel. |

## Storage

Characters live in the browser's `localStorage`. All saves go through the `CharacterRepository` interface. Its methods are async. To move to a server, write a new class that implements the interface with HTTP calls, then pass it in `src/main.ts`. Nothing else needs to change.

Loaded data passes through `normalizeCharacter`, which drops bad records and fills missing fields with defaults. Server responses can use the same function.
