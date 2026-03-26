# Getting Started with JamKit

Your first 30 minutes: clone, run, and make your first changes.

---

## 0. One-time Setup (5 minutes)

If you have a fresh macOS machine, run the setup script once:

```bash
git clone <repo-url> my-game
cd my-game
chmod +x setup.sh
./setup.sh
```

This installs Homebrew, nvm, Node, and dependencies. If the Xcode Command Line Tools
installer pops up, finish it and re-run `./setup.sh`. The script is idempotent, so
re-running it is safe.

If you have a fresh Windows machine, run the PowerShell setup script:

```powershell
git clone <repo-url> my-game
cd my-game
.\setup.ps1
```

This installs Git, Node.js LTS, and dependencies via winget. If `winget` is missing,
install "App Installer" from the Microsoft Store, restart PowerShell, then re-run
`.\setup.ps1`. The script is idempotent, so re-running it is safe.

Optional verification step on either platform:

```bash
# macOS
./setup.sh --verify

# Windows PowerShell
.\setup.ps1 --verify
```

Optional network precheck modes:

```bash
# Fail fast if registry is unreachable
./setup.sh --network-check=strict
.\setup.ps1 --network-check=strict

# Skip only the precheck (install steps still need network)
./setup.sh --skip-network-check
.\setup.ps1 --skip-network-check
```

Setup logs are written to `setup.log` in the project root.

If setup fails, see `documentation/setup-troubleshooting.md`.

---

## 1. Clone & Run (2 minutes)

```bash
git clone <repo-url> my-game
cd my-game
npm install
npm run dev
```

Open http://localhost:5173 — you should see the example game.

**On mobile:** Use the same URL on your phone (your computer and phone must be on the same network). The dev server shows the network URL in the terminal.

---

## 2. Play the Example Game

- **Tap** anywhere on the ground to move the character
- **Drag** to rotate the camera (“look”)
- **Collect pickups** (crystals) to increase your score
- **Timer** counts down from 60 seconds
- **Results screen** shows your score with "Play Again"

**This is just a pipeline proof.** You will replace the example game with your own. 
When you’re ready, follow `documentation/REPLACING_SAMPLE_GAME.md`.

---

## 3. Make Your First Change: Player Speed (5 minutes)

Open `src/config/tuning.ts` and change:

```typescript
playerMoveSpeed: 4.5,  // Try 10.0 for fast, 2.0 for slow
```

Save. The page hot-reloads. Your character now moves faster/slower.

---

## 4. Change the Game Duration (2 minutes)

In the same file:

```typescript
gameDurationSec: 60,  // Try 15 for quick rounds
```

---

## 5. Add a New Pickup Spawn (5 minutes)

### Option A (fastest): spawn more crystals

Open `src/config/tuning.ts` and change:

```typescript
crystalCount: 15,  // Try 30
```

### Option B: add a fixed spawn point (in addition to random spawns)

Open `src/states/PlayState.ts` and search for `const positions = sampleRandomPositions({`.

Right after the `positions` array is created, add:

```typescript
positions.push(new Vector3(-2, 0, -2));
```

---

## 6. Add a New Sound Effect (10 minutes)

### Step 1: Get the file

Find a sound in `kenney/` (e.g., `kenney/Audio/Interface/switch_001.mp3`) or use your own.

### Step 2: Copy to runtime assets

```bash
cp kenney/Audio/Interface/switch_001.mp3 public/assets/sounds/kenney/interface/
```

### Step 3: Register the asset

In `src/assets/assetIds.ts`, add:

```typescript
export enum AssetId {
  // ... existing
  KenneySfxSwitch = "KenneySfxSwitch",
}
```

In `src/assets/assetRegistry.ts`, add to the registry:

```typescript
[AssetId.KenneySfxSwitch]: {
  kind: "audio",
  mp3Path: "assets/sounds/kenney/interface/switch_001.mp3",
  // oggPath: "assets/sounds/kenney/interface/switch_001.ogg", // optional
},
```

### Step 4: Play it

Anywhere you have access to `AudioManager`:

```typescript
// Ensure audio is unlocked (mobile requirement), then play
void ctx.audio.unlock().then(() => ctx.audio.playSfx(AssetId.KenneySfxSwitch));
```

---

## 7. Change UI Text (2 minutes)

Open `src/ui/hud.ts`. Find:

```typescript
setHint("Tap to move • Drag to look");
```

Change the string and save.

---

## 8. Debug Tools

- **Z** (desktop): Toggle FPS/debug overlay
- **X** (desktop): Toggle Babylon Inspector (dev only)

---

## Next Steps

- Read `documentation/HOW_TO.md` for more recipes
- Check `documentation/cameras.md` if you want to change the camera
- See `documentation/assets.md` for adding 3D models
- Browse `kenney/` for CC0 assets you can use

---

## Troubleshooting

If something doesn't work, check `documentation/TROUBLESHOOTING.md`.

Common issues:
- **Blank screen**: Check browser console for errors
- **Audio not playing**: Tap once to unlock mobile audio
- **Model not visible**: Check the path in `assetRegistry.ts`

