import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { count, reasonsForMissing } from './model.mjs';

export async function readJson(path, fallback = null) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await rename(temporary, path);
}

export function paths(root, username) {
  const base = join(root, 'data', username);
  return {
    base,
    profile: join(base, 'profile.json'),
    discovery: join(base, 'discovery.json'),
    items: join(base, 'items.json'),
    run: join(base, 'run.json'),
    report: join(base, 'report.html'),
    csv: join(base, 'items.csv'),
    profileCsv: join(base, 'profile.csv')
  };
}

export function mergeItem(previous, current) {
  if (!previous) return current;
  const result = { ...previous, ...current };
  for (const field of ['date', 'caption', 'likes', 'comments', 'views', 'thumbnail_url', 'media_url']) {
    if (result[field] == null && previous[field] != null) result[field] = previous[field];
  }
  if ((previous.date_precision === 'timestamp' || /^\d{4}-\d{2}-\d{2}T/.test(previous.date || ''))
    && current.date_precision !== 'timestamp') {
    result.date = previous.date;
    result.date_precision = 'timestamp';
  }
  result.status = ['date', 'likes', 'comments', 'views'].every((field) => result[field] != null) ? 'complete' : 'partial';
  result.missing = ['date', 'likes', 'comments', 'views'].filter((field) => result[field] == null);
  result.missing_reasons = reasonsForMissing(result.missing, result);
  return result;
}

export function syncGridViews(previous, discovered, observedAt) {
  const raw = discovered.grid_views_raw;
  if (!raw) {
    const result = { ...previous, grid_views_raw: previous.grid_views_raw || null,
    grid_views_issue: Object.hasOwn(discovered, 'grid_views_issue')
      ? discovered.grid_views_issue : previous.grid_views_issue || null };
    result.missing_reasons = reasonsForMissing(result.missing || [], result);
    return result;
  }
  const parsed = count(raw);
  const result = { ...previous, grid_views_raw: raw, grid_views_issue: null };
  if (parsed && (!previous.views || previous.views.source === 'profile_grid')) {
    result.views = { ...parsed, source: 'profile_grid', observed_at: observedAt };
    result.status = ['date', 'likes', 'comments', 'views'].every((field) => result[field] != null) ? 'complete' : 'partial';
    result.missing = ['date', 'likes', 'comments', 'views'].filter((field) => result[field] == null);
  }
  result.missing_reasons = reasonsForMissing(result.missing || [], result);
  return result;
}

export function mergeProfile(previous, current) {
  if (!previous) return current;
  const result = { ...previous, ...current };
  for (const field of ['display_name', 'bio', 'posts_count', 'followers_count', 'category', 'ai_generated_profile',
    'profile_picture_url', 'date_joined', 'account_based_in', 'former_usernames_count']) {
    if (result[field] == null && previous[field] != null) result[field] = previous[field];
  }
  return result;
}
