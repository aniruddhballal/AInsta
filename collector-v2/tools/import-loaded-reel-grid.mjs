import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { count, profileLevelComplete } from '../src/model.mjs';
import { writeReport } from '../src/report.mjs';
import { paths, readJson, writeJson } from '../src/store.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [snapshotFile, username, option] = process.argv.slice(2);
if (!snapshotFile || !/^[A-Za-z0-9._]{1,30}$/.test(username || '') || ![undefined, '--dry-run'].includes(option)) {
  throw new Error('Usage: node tools/import-loaded-reel-grid.mjs SNAPSHOT.json USERNAME [--dry-run]');
}

const snapshot = JSON.parse(await readFile(resolve(snapshotFile), 'utf8'));
const target = paths(root, username);
const [profile, discovery, priorItems, priorRun] = await Promise.all([
  readJson(target.profile), readJson(target.discovery, {}), readJson(target.items, []), readJson(target.run, {})
]);
if (!profile || !Array.isArray(priorItems) || !snapshot || snapshot.username !== username) {
  throw new Error('Snapshot username or saved profile data does not match.');
}
const validation = snapshot.validation || {};
if (snapshot.error || validation.error || snapshot.reached_top !== true || snapshot.reached_bottom !== true
  || validation.reached_bottom !== true || validation.before !== validation.after
  || !Number.isInteger(validation.passes) || validation.passes < 1
  || !Array.isArray(snapshot.items) || snapshot.items.length !== validation.after) {
  throw new Error('Two complete, stable sweeps of the loaded grid are required.');
}

const observedAt = validation.finished_at;
if (!observedAt || Number.isNaN(Date.parse(observedAt))) throw new Error('Missing capture timestamp.');
const unique = new Map();
for (const item of snapshot.items) {
  if (!/^[A-Za-z0-9_-]+$/.test(item.shortcode || '')
    || new URL(item.url).pathname !== `/${username}/reel/${item.shortcode}/`
    || unique.has(item.shortcode)) throw new Error(`Invalid or duplicate reel: ${item.shortcode}`);
  for (const field of ['grid_views_raw', 'grid_likes_raw', 'grid_comments_raw']) {
    if (!count(item[field])) throw new Error(`Unreadable ${field} for ${item.shortcode}`);
  }
  unique.set(item.shortcode, item);
}
const missingSaved = (discovery.reel?.items || []).filter((item) => !unique.has(item.shortcode));
if (missingSaved.length) throw new Error(`${missingSaved.length} previously saved reel links are absent from this capture.`);
const idHash = createHash('sha256').update([...unique.keys()].sort().join('\n')).digest('hex');
const verification = {
  source: 'loaded_firefox_reel_grid', observed_at: observedAt,
  first_sweep_reached_top: true, first_sweep_reached_bottom: true,
  second_sweep_reached_bottom: true, second_sweep_added: validation.after - validation.before,
  previous_links_confirmed: discovery.reel?.items?.length || 0,
  unique_reels: unique.size, shortcode_sha256: idHash
};
console.log(JSON.stringify(verification, null, 2));
if (option === '--dry-run') process.exit(0);

const savedById = new Map((discovery.reel?.items || []).map((item) => [item.shortcode, item]));
const gridItems = [...unique.values()].reverse().map((item) => ({
  ...savedById.get(item.shortcode), kind: 'reel', shortcode: item.shortcode,
  url: `https://www.instagram.com/reel/${item.shortcode}/`,
  grid_views_raw: item.grid_views_raw, grid_likes_raw: item.grid_likes_raw,
  grid_comments_raw: item.grid_comments_raw, grid_views_issue: null
}));
const nextDiscovery = { ...discovery, reel: {
  ...discovery.reel, items: gridItems, complete: true, error: '', attempted_at: observedAt,
  source: verification.source, verification
} };
if (!profileLevelComplete(profile, nextDiscovery)) throw new Error('Profile header or exact post count is still incomplete.');

const oldItems = new Map(priorItems.map((item) => [item.url, item]));
const observed = (raw, source) => ({ ...count(raw), source, observed_at: observedAt });
const itemRecords = gridItems.map((item) => {
  const old = oldItems.get(item.url) || {};
  oldItems.delete(item.url);
  return { ...old, ...item, status: old.status || 'pending',
    views: observed(item.grid_views_raw, 'profile_grid'),
    likes: observed(item.grid_likes_raw, 'profile_grid_hover'),
    comments: observed(item.grid_comments_raw, 'profile_grid_hover') };
});
itemRecords.push(...oldItems.values());
const nextRun = { ...priorRun, status: 'complete', phase: 'done', current_url: null,
  error: null, updated_at: observedAt, verification_source: verification.source };
const evidence = { ...snapshot, page_url: `https://www.instagram.com/${username}/reels/`, verification };
await writeJson(resolve(target.base, 'firefox-grid-capture.json'), evidence);
await writeJson(target.discovery, nextDiscovery);
await writeJson(target.items, itemRecords);
await writeJson(target.run, nextRun);
await writeReport(target, profile, nextDiscovery, itemRecords, nextRun);

const csv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const lines = [[ 'shortcode', 'url', 'views_displayed', 'views_estimate', 'views_approximate',
  'likes_displayed', 'likes_estimate', 'likes_approximate', 'comments_displayed',
  'comments_estimate', 'comments_approximate', 'observed_at', 'source' ]];
for (const item of gridItems) lines.push([
  item.shortcode, item.url, item.grid_views_raw, count(item.grid_views_raw).value,
  count(item.grid_views_raw).approximate, item.grid_likes_raw, count(item.grid_likes_raw).value,
  count(item.grid_likes_raw).approximate, item.grid_comments_raw,
  count(item.grid_comments_raw).value, count(item.grid_comments_raw).approximate,
  observedAt, verification.source
]);
await writeFile(resolve(target.base, 'reel-grid.csv'), lines.map((row) => row.map(csv).join(',')).join('\n') + '\n');
console.log(`Imported ${gridItems.length} verified reels for @${username}.`);
