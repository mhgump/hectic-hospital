import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const kenneyRoot = path.join(repoRoot, "kenney");
const outPath = path.join(repoRoot, "documentation", "KENNEY_CATALOG.md");

function listDirs(p) {
  if (!fs.existsSync(p)) return [];
  return fs
    .readdirSync(p, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

function mdSection(title, items) {
  const lines = [`## ${title}`, ""];
  for (const it of items) lines.push(`- ${it}`);
  lines.push("");
  return lines.join("\n");
}

if (!fs.existsSync(kenneyRoot)) {
  // eslint-disable-next-line no-console
  console.error(`Missing kenney folder at: ${kenneyRoot}`);
  process.exit(1);
}

const twoD = listDirs(path.join(kenneyRoot, "2D assets"));
const threeD = listDirs(path.join(kenneyRoot, "3D assets"));
const audio = listDirs(path.join(kenneyRoot, "Audio"));
const icons = listDirs(path.join(kenneyRoot, "Icons"));
const ui = listDirs(path.join(kenneyRoot, "UI assets"));

const header = `# Kenney Bundle Catalog (for JamKit)

JamKit vendors the full Kenney bundle under \`kenney/\` (CC0). The game should only load **curated runtime assets** from \`public/assets/...\`.

This catalog exists so an LLM (and humans) can quickly see **what packs exist** without indexing tens of thousands of binaries.

## How to search for a specific asset filename

Use:

\`\`\`bash
npm run kenney:search -- <query>
\`\`\`

Examples:

\`\`\`bash
npm run kenney:search -- "mini arena" --limit 50
npm run kenney:search -- "character" --ext glb --limit 50
\`\`\`

---
`;

let md = header;
md += mdSection("2D packs (`kenney/2D assets/`)", twoD);
md += mdSection("3D packs (`kenney/3D assets/`)", threeD);
md += mdSection("Audio packs (`kenney/Audio/`)", audio);
md += mdSection("UI packs (`kenney/UI assets/`)", ui);
md += mdSection("Icons packs (`kenney/Icons/`)", icons);

fs.writeFileSync(outPath, md, "utf8");
// eslint-disable-next-line no-console
console.log(`Wrote ${path.relative(repoRoot, outPath)}`);


