# Eleanor Crossing

A cozy island life game in the browser, inspired by Animal Crossing. Built with Three.js, TypeScript, and Vite.

## Run it

The game runs as a background service on this machine, reachable only over Tailscale:

- http://paulnorton-server.tailc69c78.ts.net:8003
- http://100.66.242.25:8003

Edits to the code show up right away. Browser code hot-reloads through Vite. Server code (`server/` and the shared files it imports) restarts the server automatically.

```sh
make install      # install the systemd user service, enable it, and start it
make status       # is it running, and where
make logs         # follow the log
make uninstall    # stop it and remove the service
```

The service starts at boot and restarts if it crashes. To keep it running after you log out too:

```sh
sudo loginctl enable-linger $USER
```

To run it by hand instead, stop the service first, then run `make serve` (tailnet) or `make serve-local` (this machine only).

### How the server is locked down

- It listens only on this machine's Tailscale addresses and 127.0.0.1. Devices on the local network cannot reach it.
- It refuses requests whose Host header is not one of this machine's names. This blocks DNS-rebinding attacks from web pages open on tailnet devices.
- The systemd unit can only write to `data/` and Vite's cache.

## Features

**Character creator.** Pick a person or an animal (cat, dog, bunny, bear, fox, frog). Choose skin or fur color, eyes, cheeks, hair, outfit, and hat. Drag the 3D preview to spin it. Save as many residents as you like.

**The island.** Walk around a small island with a plaza, fountain, river, bridge, beach, trees, rocks, and flowers. Six villagers live in their own houses. They wander near home, stop when you come close, and chat when you talk to them. The sky follows your local time of day. The game remembers where you were standing, even indoors.

**Houses.** Walk into a villager's front door to go inside. The owner is home and welcomes you in. Each house has its own wall color and a furniture layout that suits its owner's personality. Walk down onto the red doormat to leave.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys | Joystick, bottom left |
| Run | Hold Shift | Push the joystick all the way |
| Talk / next line | E, Space, or Enter | A button, bottom right |
| Enter a house | Walk into the front door | Same |
| Leave a house | Walk onto the doormat | Same |

## Code layout

| Path | Purpose |
| --- | --- |
| `src/character/model.ts` | Character data, options, defaults, and validation. |
| `src/character/build.ts` | Builds the 3D character from its data. |
| `src/scene/stage.ts` | The 3D island scene, camera, and animation. |
| `server/main.ts` | The server: Tailscale binding, Host check, Vite, and the API. |
| `server/api.ts` | The `/api` routes. |
| `server/store.ts` | Saves game data to a JSON file. |
| `src/storage/httpRepositories.ts` | The browser's side of the API. |
| `src/storage/migrate.ts` | Uploads data saved in the browser before the server existed. |
| `src/storage/characterRepository.ts` | Character storage interface and the old browser-only version. |
| `src/character/animator.ts` | Idle, walk, wave, and blink animation. |
| `src/ui/creator.ts` | The character creator panel. |
| `src/world/map.ts` | Island layout and collision. Pure data, no rendering. |
| `src/world/npcs.ts` | Villagers and their dialogue. |
| `src/world/scenery.ts` | Builds the island's 3D scenery. |
| `src/world/interior.ts` | House rooms: furniture layouts and collision. Pure data, no rendering. |
| `src/world/interiorScenery.ts` | Builds rooms and furniture in 3D. |
| `src/world/world.ts` | The island game loop: player, villagers, camera. |
| `src/world/hud.ts` | Dialogue box, talk prompt, minimap, clock, touch controls. |
| `src/world/input.ts` | Keyboard and touch input. |
| `src/storage/worldStateRepository.ts` | Position storage interface and the old browser-only version. |

## Storage

Game data lives on the server in `data/eleanor-crossing.json`, so every device sees the same residents. The file is not in git. Back it up if you care about it.

- Characters and where each one last stood are stored on the server.
- The character a device plays as is stored in that browser. Two devices can play different residents.
- Characters saved in a browser before the server existed upload automatically the first time that browser opens the game.

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/characters` | List characters. |
| GET, PUT, DELETE | `/api/characters/:id` | Read, create or update, delete a character. Deleting also removes its position. |
| GET, PUT | `/api/characters/:id/state` | Read or save where the character is standing, and which house they are in. Reads `null` if never saved. |

The server checks everything it receives with the same `normalizeCharacter` and `normalizePlayerState` functions the browser uses. It writes the data file atomically after each change. `server/store.ts` defines a `GameStore` interface, so a database can replace the JSON file later.
