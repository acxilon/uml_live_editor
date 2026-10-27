import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', '@plantuml', 'core');
const dest = path.join(root, 'public');

if (!existsSync(src)) {
  console.log('[assets] @plantuml/core is not installed yet, skipping.');
  process.exit(0);
}

// The PlantUML engine loads viz-global.js as a classic script and fetches
// themes.js / emoji.js / openiconic.js relative to the page URL, so they must
// sit at the root of the served renderer directory.
const assets = ['viz-global.js', 'themes.js', 'emoji.js', 'openiconic.js', 'plantuml.js'];

await rm(path.join(dest, 'plantuml'), { recursive: true, force: true });
await mkdir(dest, { recursive: true });
let copied = 0;
for (const file of assets) {
  const from = path.join(src, file);
  if (!existsSync(from)) continue;
  await cp(from, path.join(dest, file));
  copied += 1;
}
await cp(path.join(src, 'LICENSE'), path.join(dest, 'PLANTUML_LICENSE.txt')).catch(() => {});
console.log(`[assets] copied ${copied} PlantUML runtime file(s) to public/`);
