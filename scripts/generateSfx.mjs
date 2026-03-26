#!/usr/bin/env node
/**
 * Sound effect generation pipeline:
 *   Text prompt → ElevenLabs Sound Effects 2 → MP3
 *
 * Usage:
 *   node --env-file=.env scripts/generateSfx.mjs "<prompt>" [output-name] [--duration N] [--loop]
 *
 * Options:
 *   --duration N   Duration in seconds, 0.5–22 (default: auto from prompt)
 *   --loop         Generate a loopable sound effect
 *
 * Output: public/assets/sounds/<output-name>.mp3
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { post, pollJob, downloadAsset } from "./_scenario.mjs";

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SFX_MODEL = "model_elevenlabs-sound-effects-v2";
const OUTPUT_DIR = path.join(PROJECT_DIR, "public/assets/sounds");

function parseArgs(argv) {
  const args = { prompt: null, name: null, duration: null, loop: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--duration" && argv[i + 1]) {
      args.duration = parseFloat(argv[++i]);
    } else if (argv[i] === "--loop") {
      args.loop = true;
    } else {
      positional.push(argv[i]);
    }
  }
  [args.prompt, args.name] = positional;
  return args;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.prompt) {
    console.error('Usage: node --env-file=.env scripts/generateSfx.mjs "<prompt>" [output-name] [--duration N] [--loop]');
    console.error('Example: npm run generateSfx -- "hospital monitor beep, steady rhythm" monitor_beep');
    process.exit(1);
  }

  const baseName = args.name ?? args.prompt.slice(0, 40).replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const outPath = path.join(OUTPUT_DIR, `${baseName}.mp3`);

  if (fs.existsSync(outPath)) {
    console.log(`Already exists: ${path.relative(PROJECT_DIR, outPath)} — delete it to regenerate.`);
    process.exit(0);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Prompt: "${args.prompt}"`);
  if (args.duration) console.log(`Duration: ${args.duration}s`);
  if (args.loop) console.log("Loop: yes");

  const body = {
    text: args.prompt,
    promptInfluence: 0.3,
    loop: args.loop,
    outputFormat: "mp3_44100_128",
  };
  if (args.duration !== null) body.durationSeconds = args.duration;

  console.log("\nGenerating sound effect (ElevenLabs Sound Effects 2)...");
  const result = await post(`/generate/custom/${SFX_MODEL}`, body);
  const jobId = result.job?.jobId ?? result.jobId;
  console.log(`  Job: ${jobId}`);
  const job = await pollJob(jobId);
  const assetId = job.metadata.assetIds[0];
  console.log(`  Asset: ${assetId}`);

  console.log(`Downloading → ${path.relative(PROJECT_DIR, outPath)}`);
  await downloadAsset(assetId, outPath);

  console.log(`\nDone: ${outPath}`);
  console.log("Next: register it in src/assets/assetIds.ts and src/assets/assetRegistry.ts");
}

run().catch((err) => {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
});
