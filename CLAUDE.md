# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

```bash
npm start        # launches Electron window (1080×720, non-resizable)
```

There is no build step, linter, or test suite configured.

## Architecture

This is an **Electron-based level editor** for a platformer game called "Pellizzola Brothers". The app is a single-page tool — all editor logic lives in `script.js`, rendered inside a static `index.html`, styled by `style.css`. Electron's role (`index.js`) is minimal: open a `BrowserWindow` loading `index.html`.

### Grid & scenes

The canvas renders a fixed **30×20 tile grid**. A "level" contains up to **9 scenes** (multi-room support). Each scene is an object `{ map: number[][], startPos, endPos }` where `map` is a 2-D array with `null` for empty cells and integer tile IDs for placed tiles.

`scene()` / `sceneMap()` are shortcuts to the currently active scene.

### Tile IDs

| ID | Tile |
|----|------|
| 0  | Eraser (empty) |
| 1  | START marker |
| 2  | Brick |
| 3  | Lucky Block |
| 4  | END marker |
| 5  | Ice Block |

Tile IDs, colors, sprites, and metadata (name, description, category, tags) are all defined together in `BLOCK_REGISTRY` and `TILE_COLORS` / `SPRITE_PATHS`. When adding a new block type, update all three.

### Textures

Sprites live in the `textures/` submodule (separate git repo). The app loads them at startup via `loadSprites()` and falls back to colored rectangles if images fail to load — so the editor works without the submodule initialized.

### Saved level format (JSON)

```json
{
  "level": {
    "information": { "name": "", "description": "", "author": "" },
    "data": [
      ["000","001",...],   // scene 1 — 600 entries (30 cols × 20 rows), row-major
      ["000","002",...]    // scene 2, etc.
    ]
  }
}
```

Each entry is a zero-padded 3-character string (`"003"`). The loader also handles the legacy format where `data` is a flat array (single scene).

The `.lvl` files in the repo root are ZIP archives containing `LEVEL_DATA.json` and a `MIDI_DATA/` folder — they are not the plain-JSON format.
