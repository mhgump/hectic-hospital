#!/usr/bin/env node
/**
 * Texture generation pipeline:
 *   Text prompt → Realistic Textures 3.0 → PNG(s)
 *   Optionally: --rembg removes background (for decal textures)
 *
 * Usage:
 *   node --env-file=.env scripts/generateTexture.mjs "<prompt>" [output-name] [--count N] [--rembg]
 *
 * Options:
 *   --count N   Number of texture variants to generate (default: 4)
 *   --rembg     Remove background from generated images (uses @imgly/background-removal-node)
 *
 * Output: public/assets/textures/<output-name>_1.png, _2.png, ...
 */

import fs from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { post, pollJob, downloadAsset } from "./_scenario.mjs";

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEXTURE_MODEL = "model_bfl-flux-1-dev";
const TEXTURE_LORA = "model_jM6aNXDGR2DyqujYRisjDa6r";
const OUTPUT_DIR = path.join(PROJECT_DIR, "public/assets/textures");

function parseArgs(argv) {
  const args = { prompt: null, name: null, count: 4, rembg: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--count" && argv[i + 1]) {
      args.count = parseInt(argv[++i], 10);
    } else if (argv[i] === "--rembg") {
      args.rembg = true;
    } else {
      positional.push(argv[i]);
    }
  }
  [args.prompt, args.name] = positional;
  return args;
}

async function removeBackground(filePath) {
  // Dynamically import so the package is only loaded when --rembg is used.
  // Install: npm install @imgly/background-removal-node
  const { removeBackground: rembg } = await import("@imgly/background-removal-node");
  process.stdout.write(`    rembg: removing background from ${path.basename(filePath)}...`);
  // Pass as a file:// URL — the library detects format from URL/extension, not buffer magic bytes
  const resultBlob = await rembg(new URL(`file://${filePath}`));
  const arrayBuffer = await resultBlob.arrayBuffer();
  await writeFile(filePath, Buffer.from(arrayBuffer));
  process.stdout.write(" done\n");
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.prompt) {
    console.error(
      'Usage: node --env-file=.env scripts/generateTexture.mjs "<prompt>" [output-name] [--count N] [--rembg]'
    );
    process.exit(1);
  }

  const baseName = args.name ?? args.prompt.slice(0, 32).replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Prompt:  "${args.prompt}"`);
  console.log(`Outputs: ${args.count} variant(s) → public/assets/textures/${baseName}_N.png`);
  if (args.rembg) console.log("Options: background removal enabled (--rembg)");

  console.log("\nGenerating textures (Realistic Textures 3.0)...");
  const result = await post(`/generate/custom/${TEXTURE_MODEL}`, {
    modelId: TEXTURE_LORA,
    loras: [TEXTURE_LORA],
    lorasScale: [0.8],
    prompt: args.prompt,
    numOutputs: args.count,
    numInferenceSteps: 28,
    width: 1024,
    height: 1024,
    guidance: 3.5,
  });

  const jobId = result.job?.jobId ?? result.jobId;
  console.log(`  Job: ${jobId}`);
  const job = await pollJob(jobId);

  const assetIds = job.metadata.assetIds;
  console.log(`\nDownloading ${assetIds.length} texture(s)...`);

  const saved = [];
  for (let i = 0; i < assetIds.length; i++) {
    const outPath = path.join(OUTPUT_DIR, `${baseName}_${i + 1}.png`);
    process.stdout.write(`  [${i + 1}/${assetIds.length}] ${path.relative(PROJECT_DIR, outPath)}...`);
    await downloadAsset(assetIds[i], outPath);
    process.stdout.write(" done\n");

    if (args.rembg) {
      await removeBackground(outPath);
    }

    saved.push(outPath);
  }

  console.log(`\nDone. ${saved.length} texture(s) saved to public/assets/textures/`);
}

run().catch((err) => {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
});
