#!/usr/bin/env node
/**
 * Ragdoll-ready character pipeline:
 *   Text prompt → Realistic Textures 3.0 (reference image)
 *              → Hunyuan 3D 3.1 Pro (40k faces, PBR)
 *              → Tripo Rigging 1.0 Biped (skeleton + rigged mesh)
 *              → GLB
 *
 * The output is a rigged biped GLB. Import into Babylon.js and use mesh.skeleton
 * to auto-generate ragdoll colliders, rigidbodies, and joints per bone.
 *
 * Usage:
 *   node --env-file=.env scripts/generateRagdoll.mjs "<prompt>" [output-name]
 *
 * Output: public/assets/models/<output-name>_rigged.glb
 * Reruns skip completed steps using public/assets/models/<output-name>_state.json.
 * The intermediate reference image is kept at public/assets/models/<output-name>_ref.png.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { post, pollJob, downloadAsset } from "./_scenario.mjs";
import { MODELS_DIR, loadState, saveState, runHunyuan } from "./generate3d.mjs";

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEXTURE_MODEL = "model_bfl-flux-1-dev";
const TEXTURE_LORA = "model_jM6aNXDGR2DyqujYRisjDa6r";
const RIGGING_MODEL = "model_tripo-rigging-v1";

async function run() {
  const [, , prompt, outputName] = process.argv;

  if (!prompt) {
    console.error('Usage: node --env-file=.env scripts/generateRagdoll.mjs "<prompt>" [output-name]');
    console.error('Example: npm run generateRagdoll -- "nurse, hospital uniform, humanoid figure, white scrubs" nurse');
    process.exit(1);
  }

  const baseName = outputName ?? prompt.slice(0, 32).replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  const state = loadState(baseName);

  console.log(`Prompt: "${prompt}"`);

  // Step 1: Reference image — skip if already on disk
  const refPath = path.join(MODELS_DIR, `${baseName}_ref.png`);
  if (fs.existsSync(refPath)) {
    console.log(`\nStep 1/4: Reference image — skipped (${path.relative(PROJECT_DIR, refPath)} exists)`);
  } else {
    console.log("\nStep 1/4: Generating reference image (Realistic Textures 3.0)...");
    const imgResult = await post(`/generate/custom/${TEXTURE_MODEL}`, {
      modelId: TEXTURE_LORA,
      loras: [TEXTURE_LORA],
      lorasScale: [0.8],
      prompt,
      numOutputs: 1,
      numInferenceSteps: 28,
      width: 1024,
      height: 1024,
      guidance: 3.5,
    });
    const imgJobId = imgResult.job?.jobId ?? imgResult.jobId;
    console.log(`  Job: ${imgJobId}`);
    const imgJob = await pollJob(imgJobId);
    console.log(`  Asset: ${imgJob.metadata.assetIds[0]}`);
    console.log(`  Saving ref → ${path.relative(PROJECT_DIR, refPath)}`);
    await downloadAsset(imgJob.metadata.assetIds[0], refPath);
  }

  const refBase64 = `data:image/png;base64,${fs.readFileSync(refPath).toString("base64")}`;

  // Step 2: Hunyuan 3D — skip if cached
  let hunyuanAssetId = state.hunyuanAssetId;
  if (hunyuanAssetId) {
    console.log(`\nStep 2/4: Hunyuan — skipped (cached: ${hunyuanAssetId})`);
  } else {
    console.log("");
    hunyuanAssetId = await runHunyuan(refBase64, "2/4");
    saveState(baseName, { ...state, hunyuanAssetId });
  }

  // Step 3: Tripo Rigging — skip if cached
  let riggedAssetId = state.riggedAssetId;
  if (riggedAssetId) {
    console.log(`Step 3/4: Rigging — skipped (cached: ${riggedAssetId})`);
  } else {
    console.log("Step 3/4: Tripo Rigging 1.0 (biped skeleton)...");
    const rigResult = await post(`/generate/custom/${RIGGING_MODEL}`, {
      model: hunyuanAssetId,
      rigType: "biped",
      animation: "",
      includeRiggedModel: true,
    });
    const rigJobId = rigResult.job?.jobId ?? rigResult.jobId;
    console.log(`  Job: ${rigJobId}`);
    const rigJob = await pollJob(rigJobId);
    riggedAssetId = rigJob.metadata.assetIds[0];
    console.log(`  Asset: ${riggedAssetId}`);
    saveState(baseName, { ...state, hunyuanAssetId, riggedAssetId });
  }

  // Step 4: Download
  const outPath = path.join(MODELS_DIR, `${baseName}_rigged.glb`);
  console.log(`Step 4/4: Downloading → ${path.relative(PROJECT_DIR, outPath)}`);
  await downloadAsset(riggedAssetId, outPath);

  console.log(`\nDone: ${outPath}`);
  console.log(`Ref image kept at: ${refPath}`);
  console.log("Next steps:");
  console.log("  1. Register in src/assets/assetIds.ts and src/assets/assetRegistry.ts");
  console.log("  2. Load with SceneLoader and access mesh.skeleton");
  console.log("  3. Use skeleton bones to attach PhysicsImpostor per bone for ragdoll");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error(`\nERROR: ${err.message}`);
    process.exit(1);
  });
}
