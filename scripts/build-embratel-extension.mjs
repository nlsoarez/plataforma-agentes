import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'tools', 'embratel-rec-extension');
const output = path.join(source, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (entry.name === 'dist') continue;
  await cp(path.join(source, entry.name), path.join(output, entry.name), { recursive: true });
}

await sharp(path.join(source, 'icons', 'icon.svg'))
  .resize(128, 128)
  .png()
  .toFile(path.join(output, 'icons', 'icon-128.png'));

const background = await readFile(path.join(output, 'background.js'), 'utf8');
if (/up\.railway\.app|WHATSAPP_RELAY_SECRET\s*=\s*["'][^"']+/i.test(background)) {
  throw new Error('Build bloqueado: endpoint Railway ou segredo fixo encontrado na extensao.');
}
for (const file of ['background.js', 'local-monitor.js', 'popup.js', 'options.js', 'alert.js']) {
  execFileSync(process.execPath, ['--check', path.join(output, file)], { stdio: 'inherit' });
}

const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
console.log(`Extensao EMBRATEL ${manifest.version} gerada em ${output}`);
