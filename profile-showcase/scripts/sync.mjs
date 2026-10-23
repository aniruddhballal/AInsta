import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(site, '..');
const snapshot = join(site, 'snapshot');
const source = join(repo, 'collector-v2', 'data', 'edlt.shox');
const files = ['profile.json', 'discovery.json', 'items.json', 'run.json', 'profile.csv', 'items.csv', 'report.html'];
const catalog = JSON.parse(await readFile(join(repo, 'bot-info', 'database', 'profiles', 'index.json'), 'utf8'));
if (!Array.isArray(catalog.profile_keys) || !catalog.profile_keys.includes('edlt.shox')) {
  throw new Error('The profile catalog must contain edlt.shox.');
}
await mkdir(join(snapshot, 'edlt.shox'), { recursive: true });
await copyFile(join(repo, 'bot-info', 'database', 'profiles', 'index.json'), join(snapshot, 'index.json'));
for (const file of files) await copyFile(join(source, file), join(snapshot, 'edlt.shox', file));

const profile = JSON.parse(await readFile(join(source, 'profile.json'), 'utf8'));
const items = JSON.parse(await readFile(join(source, 'items.json'), 'utf8'));
const mediaDir = join(snapshot, 'media');
await mkdir(mediaDir, { recursive: true });
const images = [
  { file: 'avatar.jpg', url: profile.profile_picture_url },
  ...items.filter((item) => item.kind === 'reel' && /^[\w-]+$/.test(item.shortcode))
    .map((item) => ({ file: `${item.shortcode}.jpg`, url: item.thumbnail_url }))
];
let saved = 0;
let failed = 0;
for (let i = 0; i < images.length; i += 6) {
  await Promise.all(images.slice(i, i + 6).map(async ({ file, url }) => {
    if (!url) { failed++; return; }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`HTTP ${response.status}`);
      await writeFile(join(mediaDir, file), Buffer.from(await response.arrayBuffer()));
      saved++;
    } catch (error) {
      failed++;
      console.warn(`Could not refresh ${file}: ${error.message}`);
    }
  }));
}
console.log(`Snapshot updated: ${catalog.profile_keys.length} profiles, ${items.length} item records, ${saved} images saved, ${failed} unavailable.`);
