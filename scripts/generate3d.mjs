#!/usr/bin/env node
/**
 * Game object generation pipeline (image input):
 *   Image → Hunyuan 3D 3.1 Pro (40k faces, PBR) → GLB
 *
 * Usage:
 *   node --env-file=.env scripts/generate3d.mjs <image.png> [output-name]
 *
 * Output: public/assets/models/<output-name>.glb
 * Reruns skip completed steps using public/assets/models/<output-name>_state.json.
 * See also: generateModel.mjs (text input), generateRagdoll.mjs (rigged + ragdoll-ready).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { post, pollJob, downloadAsset } from "./_scenario.mjs";

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HUNYUAN_MODEL = "model_hunyuan-3d-pro-3-1-i23d";
export const MODELS_DIR = path.join(PROJECT_DIR, "public/assets/models");

export function loadState(baseName) {
  const statePath = path.join(MODELS_DIR, `${baseName}_state.json`);
  if (fs.existsSync(statePath)) {
    try {
      return JSON.parse(fs.readFileSync(statePath, "utf8"));
    } catch {
      return {};
    }
  }
  return {};
}

export function saveState(baseName, state) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  const statePath = path.join(MODELS_DIR, `${baseName}_state.json`);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/** Step: Hunyuan 3D generation. Returns assetId. */
export async function runHunyuan(imageBase64, stepLabel) {
  console.log(`Step ${stepLabel}: Hunyuan 3D 3.1 Pro generation (40k faces, PBR)...`);
  const result = await post(`/generate/custom/${HUNYUAN_MODEL}`, {
    image: imageBase64,
    faceCount: 40000,
    generateType: "Normal",
    enablePbr: true,
  });
  const jobId = result.job?.jobId ?? result.jobId;
  console.log(`  Job: ${jobId}`);
  const job = await pollJob(jobId);
  const assetId = job.metadata.assetIds[0];
  console.log(`  Asset: ${assetId}`);
  return assetId;
}

/**
 * Full image → GLB pipeline with state caching.
 * Skips completed steps on rerun.
 */
export async function run3dPipeline(imageBase64, baseName) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  const state = loadState(baseName);

  let hunyuanAssetId = state.hunyuanAssetId;
  if (hunyuanAssetId) {
    console.log(`Step 1/2: Hunyuan — skipped (cached: ${hunyuanAssetId})`);
  } else {
    hunyuanAssetId = await runHunyuan(imageBase64, "1/2");
    saveState(baseName, { ...state, hunyuanAssetId });
  }

  const outPath = path.join(MODELS_DIR, `${baseName}.glb`);
  console.log(`Step 2/2: Downloading → ${path.relative(PROJECT_DIR, outPath)}`);
  await downloadAsset(hunyuanAssetId, outPath);
  return outPath;
}

async function run() {
  const [, , imagePath, outputName] = process.argv;
  if (!imagePath) {
    console.error("Usage: node --env-file=.env scripts/generate3d.mjs <image.png> [output-name]");
    process.exit(1);
  }
  if (!fs.existsSync(imagePath)) {
    console.error(`Image not found: ${imagePath}`);
    process.exit(1);
  }

  const baseName = outputName ?? path.basename(imagePath, path.extname(imagePath));
  const ext = path.extname(imagePath).slice(1).toLowerCase() || "png";
  const imageBase64 = `data:image/${ext};base64,${fs.readFileSync(imagePath).toString("base64")}`;

  const outPath = await run3dPipeline(imageBase64, baseName);
  console.log(`\nDone: ${outPath}`);
  console.log("Next: register it in src/assets/assetIds.ts and src/assets/assetRegistry.ts");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error(`\nERROR: ${err.message}`);
    process.exit(1);
  });
}
