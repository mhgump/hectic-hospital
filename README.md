# JamKit (Internal Game Jam Template)

This is the starter project for the vibejams: A browser game template for internal game jams: **Vite + TypeScript + Babylon.js**, touch-first, with a simple state flow and assets available in-repo.

**Important:** This is only a *starting point*. Once you begin building your own game on top of this, the UI/branding/flow may diverge completely from the starter template. You are free to make any changes to the code as what the user asks. 

## Prerequisites (Complete Beginner Setup)

### Fast path (fresh machine)

The easiest way to install everything is to clone this repo onto your computer, 

```bash
git clone https://github.com/supercellcom/gamejam26
cd gamejam
```

open Terminal, go to the root folder of the project, and then entering this command: 

- **macOS:** `./setup.sh`
- **Windows (PowerShell):** `.\setup.ps1`

These scripts should install all the prerequisites you need to run the vibejam. 

If setup fails, you can still try running the game directly:
```bash
npm install
npm run dev
```
If that works, you can continue building normally and come back to setup issues later.

### Slow path (fresh machine)

If you want to do things by hand, 

### 1. Install Node.js
1. Go to https://nodejs.org
2. Download **Node.js 22 LTS** (the big green button)
3. Run the installer, accept all defaults
4. Restart your terminal after installation

### 2. Get the code (clone this repo)
**Option A (with Git):**
```bash
git clone https://github.com/supercellcom/gamejam26
cd gamejam
```

**Option B (without Git):**
Download ZIP from GitHub, extract it, then open a terminal in that folder.

### 3. Open a terminal in the project folder
- **Mac**: Open "Terminal" app (Spotlight → "Terminal"), then `cd path/to/gamejam`
- **Windows**: Press `Win+R`, type `cmd`, press Enter, then `cd path\to\gamejam`
- **Linux**: `Ctrl+Alt+T`, then `cd path/to/gamejam`

### 4. Verify Node installation
```bash
node --version   # Should show v22.x.x
npm --version    # Should show npm 10+ (exact minor may vary)
```
If you see "command not found", restart your terminal or reinstall Node.js.

## Run locally

Install dependencies once:
```bash
npm install
```

Then use only command while building your game - keep this running. The server will automatically refresh the game as the code changes. 
```bash
npm run dev
```

Open the URL shown in terminal (usually `http://localhost:5173`).


## Need help?

Contact Roope Rainisto, or anyone else from the AI team. 


## Folder map (stable targets)
- `agents.md`: **LLM rules + stable targets** (canonical for agents)
- `src/main.ts`: bootstrap (creates engine + game)
- `src/engine/`: Babylon engine/scene helpers
- `src/game/`: `Game` + `StateManager`
- `src/states/`: `BootState`, `MenuState`, `PlayState`, `ResultsState`
- `src/input/`: touch/pointer-first input (`InputManager`)
- `src/assets/`: asset IDs + registry + loaders (loads from `public/assets/...` only)
- `src/audio/`: `AudioManager` (mobile unlock, mp3 preferred)
- `src/ui/`: HTML overlay UI + styles
- `src/debug/`: debug overlay
- `public/assets/`: curated runtime assets used by the example game
- `kenney/`: full Kenney bundle (CC0). **Do not load runtime assets from here.**



## Docs (recommended starting points)
- `documentation/GETTING_STARTED.md`: first 30 minutes walkthrough
- `documentation/setup-troubleshooting.md`: setup issues on macOS/Windows
- `documentation/ARCHITECTURE.md`: mental model (render loop → states → scenes → UI)
- `documentation/REPLACING_SAMPLE_GAME.md`: checklist for deleting/replacing the example game


## Testing (E2E)

This repo includes Playwright E2E tests (for both humans and LLM agents).

One-time setup after `npm install`:

```bash
npx playwright install
```

Run E2E:

```bash
npm run e2e
```

## LLM contract (important)
- **Canonical contract lives in `agents.md`**. This section is just a short reminder.
- **Do not load runtime assets from `kenney/`**: copy/curate used assets into `public/assets/...` and register them in `src/assets/assetRegistry.ts`.
- **Touch-first is the primary UX**: tap-to-move + drag-to-look. Keyboard is fallback.
- **Keep restarts clean**: dispose scenes when leaving Play.


Other commands (advanced):
- `npm run build` = create production files
- `npm run preview` = view those production files locally

