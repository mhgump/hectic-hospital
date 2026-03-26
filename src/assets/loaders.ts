import "@babylonjs/loaders/glTF";

import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";

import { AssetId } from "./assetIds";
import { assetRegistry, resolvePublicAssetUrl } from "./assetRegistry";

export async function loadModelContainer(
  scene: Scene,
  assetId: AssetId
): Promise<AssetContainer> {
  const entry = assetRegistry[assetId];
  if (!entry || entry.kind !== "model") {
    throw new Error(`Asset is not a model: ${assetId}`);
  }

  const fullUrl = resolvePublicAssetUrl(entry.path);

  // Babylon's loader takes rootUrl + filename (or it may treat a full URL as a directory).
  const { rootUrl, filename } = splitUrl(fullUrl);

  // Use AssetContainer for easy instantiate/dispose patterns.
  return await SceneLoader.LoadAssetContainerAsync(rootUrl, filename, scene);
}

function splitUrl(fullUrl: string): { rootUrl: string; filename: string } {
  const idx = fullUrl.lastIndexOf("/");
  if (idx === -1) {
    return { rootUrl: "", filename: fullUrl };
  }
  return { rootUrl: fullUrl.slice(0, idx + 1), filename: fullUrl.slice(idx + 1) };
}


