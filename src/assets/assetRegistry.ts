import { AssetId } from "./assetIds";

export type ModelAsset = {
  kind: "model";
  /** Path relative to Vite base (no leading slash). */
  path: string;
};

export type AudioAsset = {
  kind: "audio";
  /** Preferred on iOS Safari and generally safe. */
  mp3Path: string;
  /** Optional, smaller on many platforms. */
  oggPath?: string;
};

export type AssetEntry = ModelAsset | AudioAsset;

export const assetRegistry: Record<AssetId, AssetEntry> = {
  [AssetId.KenneyCharacterA]: {
    kind: "model",
    path: "assets/models/kenney/blocky-characters/character-a.glb",
  },
  [AssetId.KenneyMiniArenaFloor]: {
    kind: "model",
    path: "assets/models/kenney/mini-arena/floor.glb",
  },
  [AssetId.KenneyMiniArenaWall]: {
    kind: "model",
    path: "assets/models/kenney/mini-arena/wall.glb",
  },
  [AssetId.KenneyMiniArenaWallCorner]: {
    kind: "model",
    path: "assets/models/kenney/mini-arena/wall-corner.glb",
  },
  [AssetId.KenneyMiniArenaTree]: {
    kind: "model",
    path: "assets/models/kenney/mini-arena/tree.glb",
  },
  [AssetId.KenneyCrystalPickup]: {
    kind: "model",
    path: "assets/models/kenney/tower-defense/detail-crystal.glb",
  },
  [AssetId.KenneyAnimalDog]: {
    kind: "model",
    path: "assets/models/kenney/animals/animal-dog.glb",
  },

  [AssetId.NurseRigged]: {
    kind: "model",
    path: "assets/models/nurse_rigged.glb",
  },

  [AssetId.KenneySfxClick]: {
    kind: "audio",
    mp3Path: "assets/sounds/kenney/interface/click_001.mp3",
    oggPath: "assets/sounds/kenney/interface/click_001.ogg",
  },
  [AssetId.KenneySfxPickup]: {
    kind: "audio",
    mp3Path: "assets/sounds/kenney/interface/confirmation_001.mp3",
    oggPath: "assets/sounds/kenney/interface/confirmation_001.ogg",
  },
};

export function resolvePublicAssetUrl(path: string): string {
  // Must work in:
  // - dev: BASE_URL = "/"
  // - build: BASE_URL = "./" (relative hosting under any subpath)
  //
  // Avoid URL() here: `new URL("x", "/")` throws ("Invalid base URL").
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  return `${normalizedBase}${normalizedPath}`;
}



