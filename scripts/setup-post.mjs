#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_FILE);
const PROJECT_DIR = path.resolve(SCRIPT_DIR, "..");
const VERIFY_BUILD = process.argv.includes("--verify");
const IS_WINDOWS = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

function log(message) {
  console.log(`\n==> ${message}`);
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function hint(message) {
  console.log(`    Hint: ${message}`);
}

function getCommandName(base) {
  return process.platform === "win32" ? `${base}.cmd` : base;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_DIR,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      fail(`Command not found: ${command}`);
    }
    fail(`Failed to run ${command}: ${result.error.message}`);
  }

  if (typeof result.status !== "number" || result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: process.env,
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      fail(`Command not found: ${command}`);
    }
    fail(`Failed to run ${command}: ${result.error.message}`);
  }

  if (typeof result.status !== "number" || result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    fail(stderr || `Failed running ${command} ${args.join(" ")}`);
  }

  return (result.stdout ?? "").trim();
}

function parseMinimumNodeMajor() {
  const packageJsonPath = path.join(PROJECT_DIR, "package.json");
  if (!existsSync(packageJsonPath)) {
    fail("package.json not found.");
  }

  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const nodeRange = pkg?.engines?.node;
  if (typeof nodeRange !== "string") {
    fail("package.json is missing engines.node.");
  }

  const match = nodeRange.match(/(\d+)/);
  if (!match) {
    fail(`Could not parse engines.node value: ${nodeRange}`);
  }

  return Number(match[1]);
}

function assertNodeVersion() {
  const minMajor = parseMinimumNodeMajor();
  const currentMajor = Number(process.versions.node.split(".")[0]);
  if (currentMajor < minMajor) {
    fail(`Node ${minMajor}+ is required. Found v${process.versions.node}.`);
  }
}

function assertLockfile() {
  const lockPath = path.join(PROJECT_DIR, "package-lock.json");
  const pkgPath = path.join(PROJECT_DIR, "package.json");

  if (!existsSync(lockPath)) {
    fail("package-lock.json not found. Run 'npm install' once to generate it, then commit it.");
  }

  if (existsSync(pkgPath) && existsSync(lockPath)) {
    const pkgMtime = statSync(pkgPath).mtimeMs;
    const lockMtime = statSync(lockPath).mtimeMs;
    if (pkgMtime > lockMtime) {
      console.log(
        "⚠️  package.json is newer than package-lock.json. If npm ci fails, run 'npm install' to update the lockfile."
      );
    }
  }
}

function npmCiWithHints() {
  const npmCmd = getCommandName("npm");
  const result = spawnSync(npmCmd, ["ci"], {
    cwd: PROJECT_DIR,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      fail("npm not found. Is Node.js installed correctly?");
    }
    fail(`npm ci failed: ${result.error.message}`);
  }

  if (typeof result.status !== "number" || result.status !== 0) {
    console.error("");
    console.error("npm ci failed. Common fixes:");
    hint("If lockfile is out of sync: run 'npm install', then re-run setup.");
    hint("If network failed: check your internet and try again.");
    hint("If cache is corrupt: run 'npm cache clean --force', then re-run setup.");

    if (IS_MAC) {
      hint("If permissions error on macOS: run 'sudo chown -R $(whoami) ~/.npm node_modules'.");
    } else if (IS_WINDOWS) {
      hint("If permissions error on Windows: close terminals, open PowerShell as Administrator, then re-run setup.");
      hint("If blocked by policy: run 'Set-ExecutionPolicy RemoteSigned -Scope CurrentUser'.");
    } else {
      hint("If permissions error: ensure your user owns the project directory and npm cache.");
    }

    hint("Check setup logs in 'setup.log' at the project root.");
    process.exit(result.status ?? 1);
  }
}

function main() {
  process.chdir(PROJECT_DIR);

  log("Validating Node.js version");
  assertNodeVersion();

  log("Printing tool versions");
  console.log(`Node: ${runCapture(process.execPath, ["--version"])}`);
  console.log(`npm:  ${runCapture(getCommandName("npm"), ["--version"])}`);

  assertLockfile();
  log("Installing npm dependencies");
  npmCiWithHints();

  if (VERIFY_BUILD) {
    log("Running build verification");
    run(getCommandName("npm"), ["run", "build"]);
  }

  log("Setup complete");
  console.log('Next: run "npm run dev" and open http://localhost:5173');
}

main();
