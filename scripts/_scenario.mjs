/**
 * Shared Scenario API helpers.
 * Import from other scripts — not a standalone tool.
 */

import fs from "node:fs";

export const API_BASE = "https://api.cloud.scenario.com/v1";
const POLL_INTERVAL_MS = 5000;

export function getAuthHeader() {
  const key = process.env.SCENARIO_API_KEY;
  const secret = process.env.SCENARIO_API_SECRET;
  if (!key || !secret) {
    console.error("ERROR: Missing SCENARIO_API_KEY or SCENARIO_API_SECRET.");
    console.error("Copy .env.example to .env and fill in your credentials.");
    process.exit(1);
  }
  return `Basic ${btoa(`${key}:${secret}`)}`;
}

export async function post(endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${endpoint} → ${res.status}: ${text}`);
  }
  return res.json();
}

export async function get(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { Authorization: getAuthHeader() },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${endpoint} → ${res.status}: ${text}`);
  }
  return res.json();
}

export async function pollJob(jobId) {
  process.stdout.write("  Waiting");
  while (true) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const { job } = await get(`/jobs/${jobId}`);
    if (job.status === "success") {
      process.stdout.write(" done\n");
      return job;
    }
    if (job.status === "failed" || job.status === "cancelled") {
      process.stdout.write("\n");
      throw new Error(`Job ${jobId} ended with status: ${job.status}`);
    }
    process.stdout.write(".");
  }
}

export async function downloadAsset(assetId, destPath) {
  const { asset } = await get(`/assets/${assetId}`);
  const url = asset?.url ?? asset?.urls?.original;
  if (!url) throw new Error(`No download URL found for asset ${assetId}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const buf = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buf));
}
