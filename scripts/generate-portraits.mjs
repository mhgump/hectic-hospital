#!/usr/bin/env node
/**
 * One-time script: generates NPC portraits via Scenario API (Grok Imagine)
 * and saves them to public/assets/portraits/.
 * 
 * Run with: node scripts/generate-portraits.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "assets", "portraits");

const BASE = "https://api.cloud.scenario.com/v1";
const MODEL_ID = "model_xai-grok-imagine-image";

const API_KEY = "api_HJJrpkZ7MqtJ5o7M7va1PrFb";
const API_SECRET = "1advfG9GWNLth44FmCUMHprQ";
const AUTH = "Basic " + Buffer.from(`${API_KEY}:${API_SECRET}`).toString("base64");
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

const PRESETS = [
  { id: "margaret", prompt: "Character portrait of an elderly asian woman, gray hair in a bun, reading glasses, floral hospital gown, kind worried face. Bust shot, cartoon game art style, vibrant colors, clean simple background." },
  { id: "jake", prompt: "Character portrait of a muscular caucasian man age 34, short brown hair, stubble beard, dirty construction vest over hospital gown, bandaged hand, annoyed expression. Bust shot, cartoon game art style, vibrant colors, clean simple background." },
  { id: "priya", prompt: "Character portrait of a young indian woman age 28, long dark hair, trendy clothes under hospital gown, holding phone, panicked dramatic expression. Bust shot, cartoon game art style, vibrant colors, clean simple background." },
  { id: "viktor", prompt: "Character portrait of a middle-aged slavic man age 45, scars on face, leather jacket, dark circles under eyes, shifty suspicious gaze, nervous sweat. Bust shot, cartoon game art style, vibrant colors, clean simple background." },
  { id: "eddy", prompt: "Character portrait of a chubby middle-aged polish man age 52, balding, hawaiian shirt, friendly smile despite looking green and nauseous, thumbs up. Bust shot, cartoon game art style, vibrant colors, clean simple background." },
];

async function startJob(preset) {
  const res = await fetch(`${BASE}/generate/custom/${MODEL_ID}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ prompt: preset.prompt, numOutputs: 1, aspectRatio: "1:1" }),
  });
  if (!res.ok) throw new Error(`Start failed for ${preset.id}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const jobId = data.job?.jobId;
  if (!jobId) throw new Error(`No jobId for ${preset.id}: ${JSON.stringify(data)}`);
  console.log(`  [${preset.id}] Job started: ${jobId}`);
  return { ...preset, jobId };
}

async function pollJob(job) {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const res = await fetch(`${BASE}/jobs/${job.jobId}`, { headers: { Authorization: AUTH } });
    if (!res.ok) { console.log(`  [${job.id}] Poll error ${res.status}, retrying...`); continue; }
    const data = await res.json();
    const status = data.job?.status;
    if (i % 5 === 0) console.log(`  [${job.id}] Status: ${status} (poll ${i+1})`);
    if (status === "success") {
      const assetIds = data.job.metadata?.assetIds ?? [];
      if (assetIds.length === 0) throw new Error(`No assets for ${job.id}`);
      return assetIds[0];
    }
    if (status === "failure" || status === "canceled") {
      throw new Error(`Job ${status} for ${job.id}`);
    }
  }
  throw new Error(`Timeout for ${job.id}`);
}

async function downloadAsset(assetId, presetId) {
  const res = await fetch(`${BASE}/assets/${assetId}`, { headers: { Authorization: AUTH } });
  if (!res.ok) throw new Error(`Asset fetch failed for ${presetId}: ${res.status}`);
  const data = await res.json();
  const url = data.asset?.url;
  if (!url) throw new Error(`No URL for ${presetId}: ${JSON.stringify(data)}`);

  console.log(`  [${presetId}] Downloading image...`);
  const imgRes = await fetch(url);
  if (!imgRes.ok) throw new Error(`Image download failed for ${presetId}: ${imgRes.status}`);
  const buffer = Buffer.from(await imgRes.arrayBuffer());

  const outPath = path.join(OUT_DIR, `${presetId}.png`);
  fs.writeFileSync(outPath, buffer);
  console.log(`  [${presetId}] Saved: ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("Starting 5 portrait generation jobs (Grok Imagine)...\n");
  const jobs = await Promise.all(PRESETS.map(startJob));

  console.log("\nPolling for completion (all in parallel)...\n");
  const assetIds = await Promise.all(jobs.map(pollJob));

  console.log("\nDownloading images...\n");
  for (let i = 0; i < jobs.length; i++) {
    await downloadAsset(assetIds[i], jobs[i].id);
  }

  console.log("\n=== All 5 portraits saved! ===");
  for (const job of jobs) {
    console.log(`  ${job.id}: /assets/portraits/${job.id}.png`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
