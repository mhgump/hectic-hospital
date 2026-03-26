import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const kenneyRoot = path.join(repoRoot, "kenney");

function usage() {
  // eslint-disable-next-line no-console
  console.log(`Usage:
  npm run kenney:search -- <query> [--ext glb,png] [--limit 200]

Searches file and directory names under ./kenney (by path substring, case-insensitive).
This does NOT depend on editor indexing (works even if Kenney binaries are ignored).
`);
}

function parseArgs(argv) {
  const out = { query: "", exts: null, limit: 200 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === "--help" || a === "-h") return { ...out, help: true };
    if (a === "--ext") {
      const v = argv[i + 1];
      i++;
      if (!v) continue;
      out.exts = v
        .split(",")
        .map((s) => s.trim().replace(/^\./, "").toLowerCase())
        .filter(Boolean);
      continue;
    }
    if (a === "--limit") {
      const v = Number(argv[i + 1]);
      i++;
      if (Number.isFinite(v) && v > 0) out.limit = v;
      continue;
    }
    positional.push(a);
  }
  out.query = positional.join(" ").trim();
  return out;
}

function walk(dir, onEntry) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    onEntry(full, e);
    if (e.isDirectory()) walk(full, onEntry);
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.query) {
  usage();
  process.exit(args.query ? 0 : 1);
}

if (!fs.existsSync(kenneyRoot)) {
  // eslint-disable-next-line no-console
  console.error(`Missing kenney folder at: ${kenneyRoot}`);
  process.exit(1);
}

const q = args.query.toLowerCase();
let shown = 0;
let total = 0;

const extSet = args.exts ? new Set(args.exts) : null;
const rel = (p) => path.relative(repoRoot, p).replaceAll(path.sep, "/");

walk(kenneyRoot, (full, entry) => {
  const r = rel(full).toLowerCase();
  if (!r.includes(q)) return;

  if (extSet && entry.isFile()) {
    const ext = path.extname(full).replace(/^\./, "").toLowerCase();
    if (!extSet.has(ext)) return;
  }

  total++;
  if (shown < args.limit) {
    // eslint-disable-next-line no-console
    console.log(rel(full));
    shown++;
  }
});

if (total > shown) {
  // eslint-disable-next-line no-console
  console.log(`… and ${total - shown} more (use --limit to show more)`);
}


