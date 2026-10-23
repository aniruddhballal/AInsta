import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

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
  if (previous.date_precision === 'timestamp' && current.date_precision !== 'timestamp') {
    result.date = previous.date;
    result.date_precision = 'timestamp';
  }
  result.status = ['date', 'likes', 'comments', 'views'].every((field) => result[field] != null) ? 'complete' : 'partial';
  result.missing = ['date', 'likes', 'comments', 'views'].filter((field) => result[field] == null);
  return result;
}

export function mergeProfile(previous, current) {
  if (!previous) return current;
  const result = { ...previous, ...current };
  for (const field of ['display_name', 'bio', 'posts_count', 'followers_count', 'following_count', 'category', 'ai_generated_profile',
    'profile_picture_url', 'date_joined', 'account_based_in', 'former_usernames_count']) {
    if (result[field] == null && previous[field] != null) result[field] = previous[field];
  }
  return result;
}
