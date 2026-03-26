# Hospital Room Debug — Prompt Best Practices

## Quick Start

```bash
# Terminal 1 – Vite dev server
npm run dev

# Terminal 2 – Generation server (needs .env with credentials)
npm run hospital-server

# Open in browser
http://localhost:5173/debug-hospital.html
```

The server seeds an example room on first run, then immediately starts generating all missing assets in parallel (max 3 concurrent). The browser polls every 5 seconds and swaps in real assets as they finish.

---

## How Room Layout Generation Works

When you click **New** and enter a description, the server sends your prompt to **Claude Opus** with a detailed schema. Claude returns:

| Field | What it generates |
|---|---|
| `floorTexturePrompt` | Tileable floor surface description |
| `northWallTexturePrompt` | Tileable back-wall surface description |
| `westWallTexturePrompt` | Tileable left-wall surface (different material from north) |
| `objects[]` | 1–3 specific 3D model descriptions + positions |
| `extraTextures[]` | 0–3 decal/sign placements on walls or floor |

All `null` asset paths are then queued and generated in parallel.

---

## Writing Good Room Descriptions

Claude uses your description as the creative brief. Be specific about the **type of space** and what **makes it distinctive**.

### Good descriptions

```
Reception area with a large curved front desk, waiting chairs along the wall,
and a health information notice board

Pediatric ward with small colourful beds, a toy storage shelf, and cheerful
animal wall murals

Sterile operating theatre with a central operating table, overhead surgical
light rig, and stainless steel instrument trolleys

ICU bay with fully-equipped adjustable bed, multiscreen vital signs monitors
on articulating arms, and a ventilator unit
```

### Avoid vague descriptions

```
❌ "hospital room"          →  too generic, produces default bed+IV layout
❌ "nice medical space"     →  no useful signal for object selection
❌ "reception"              →  better than nothing, but add detail
✅ "reception with front desk, chairs, notice board"
```

### Keywords Claude recognises

`reception`, `waiting`, `lobby`, `emergency`, `trauma`, `operating`, `surgery`, `theatre`, `icu`, `intensive care`, `pediatric`, `children`, `radiology`, `x-ray`, `imaging`, `pharmacy`, `medication`, `dispensary`

---

## Texture Prompts — Avoiding "Picture" Generation

The texture pipeline uses **Flux + Realistic Textures 3.0** LoRA. This LoRA is tuned for tileable surface materials, **not photographs or scenes**.

### The most important rule

Every floor/wall texture prompt **must end with `seamless tileable texture`**. Without this keyword the LoRA may generate a photo-realistic scene instead of a surface pattern.

```
✅ "hospital ceramic tile floor, small white hexagon tiles with grey grout, seamless tileable texture"
❌ "a hospital floor"   →  may produce a room photo looking down at the floor
❌ "linoleum"           →  too vague, inconsistent results
```

### Describe the surface material, not the scene

| Instead of… | Write… |
|---|---|
| "hospital wall with windows" | "hospital painted plaster wall, light blue, smooth matte surface, seamless tileable texture" |
| "old floor" | "worn vinyl composite tile floor, grey and beige speckle pattern, seamless tileable texture" |
| "nice looking wall" | "white ceramic subway tile wall with dark grey grout lines, glossy, seamless tileable texture" |

### North vs west wall — use different materials

The camera always shows both walls simultaneously. Make them visually distinct:

| North wall (back) | West wall (side) |
|---|---|
| white ceramic tiles | sage green painted plaster |
| exposed brick | light beige pebble-dash render |
| clinical white gloss paint | blue-grey wainscoting panels |
| grey concrete block | cream wood-panelled dado rail |

---

## Model Prompts — Getting Clean 3D Geometry

The model pipeline is: **Flux image → Hunyuan 3D → Tripo retopology → GLB**. The reference image quality determines the 3D result.

### The most important rule

Every model prompt **must end with `isolated on white background`**. This ensures Hunyuan 3D can cleanly segment the object from the background.

```
✅ "hospital IV drip stand, chrome metal pole with wheeled base and two bag hooks, isolated on white background"
❌ "IV stand in a hospital room"  →  may include room context, confusing the 3D pipeline
❌ "medical equipment"            →  too vague to generate a recognisable object
```

### Be specific about the object, not the setting

| Instead of… | Write… |
|---|---|
| "hospital furniture" | "adjustable hospital bed with fold-down side rails, white metal frame, isolated on white background" |
| "medical thing" | "vital signs monitor on wheeled stand, black bezel, colourful waveform display, isolated on white background" |
| "chair" | "hospital visitor chair, blue upholstered seat, chrome legs, isolated on white background" |

### Model scale and position

Objects are positioned at `[x, 0, z]` (Y is always 0, objects rest on the floor). Room bounds are `X ∈ [−4, 4]`, `Z ∈ [−4, 4]`. Door openings are centred on each wall at `X=0` and `Z=0`, so avoid placing objects at those coordinates near walls.

---

## Extra Texture Placements (Decals)

Extra textures are flat planes placed on walls or floor. They work best for:

- **Signs and notices**: emergency exit, room number, hand-hygiene poster
- **Floor markings**: direction arrows, hazard stripes, waiting zone outlines
- **Wall art / murals**: health information boards, department signage
- **Equipment silhouettes**: wall-mounted hand sanitiser, fire extinguisher outline

### Placement coordinates

```
surface: "north_wall" | "west_wall" | "floor"

uvOffset: [u, v]
  u = 0.0 → left edge,  u = 1.0 → right edge
  v = 0.0 → bottom,     v = 1.0 → top  (for walls)
  v = 0.0 → near edge,  v = 1.0 → far edge  (for floor)

uvScale: [u, v]  (fraction of surface covered)
  [0.15, 0.10]  →  15% wide, 10% tall  (small sign)
  [0.80, 0.08]  →  80% wide, 8% tall   (floor stripe)
```

### Typical placements

| Item | surface | uvOffset | uvScale |
|---|---|---|---|
| Exit sign (top-right) | north_wall | [0.85, 0.88] | [0.12, 0.08] |
| Room number plate | west_wall | [0.5, 0.85] | [0.08, 0.06] |
| Floor direction arrow | floor | [0.5, 0.5] | [0.12, 0.30] |
| Hazard stripe | floor | [0.5, 0.08] | [0.80, 0.06] |

---

## Troubleshooting

### "It generated a photo, not a texture"

Add `seamless tileable texture` to the end of the prompt. Avoid words like "room", "scene", "background", or "photo". Describe only the surface material.

### "The 3D model looks like a blob"

The reference image was probably unclear. The model prompt should describe a single isolated object with clean silhouette. Avoid "with accessories" or "in context". Try adding "front view" or "side view" to the prompt.

### "Generation failed (error badge)"

Check the terminal running `npm run hospital-server` for details. Common causes:
- Missing `.env` file (Scenario API credentials)
- Missing `ANTHROPIC_API_KEY` in `.env` (server falls back to keyword layout, not an error)
- Scenario API rate limit — tasks will show error; re-run the server to retry

### "New room used generic objects instead of my description"

`ANTHROPIC_API_KEY` is not set. Add it to `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```
The server logs `⚠ ANTHROPIC_API_KEY not set` on startup when this is missing.
