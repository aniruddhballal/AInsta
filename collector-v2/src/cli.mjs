import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, captureProfile, discover, captureItem } from './browser.mjs';
import { count, itemFromSnapshot, now, profileFromSnapshot } from './model.mjs';
import { paths, readJson, writeJson, mergeItem } from './store.mjs';
import { writeReport } from './report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] || 'status';
const flags = new Set(process.argv.slice(3));
const targetFile = await readJson(join(root, 'targets.json'));
const index = await readJson(resolve(root, '..', 'bot-info', 'database', 'profiles', 'index.json'));
const targets = targetFile?.profile_keys || [];
if (targets.length !== 1 || targets[0] !== 'edlt.shox' || !index?.profile_keys?.includes(targets[0])) {
  throw new Error('Prototype targets must contain only edlt.shox, and that username must exist in the source index.');
}
const username = targets[0];
const path = paths(root, username);
const log = (value) => console.log(`[${new Date().toLocaleTimeString('en-GB')}] ${value}`);

async function files() {
  return {
    profile: await readJson(path.profile),
    discovery: await readJson(path.discovery, {}),
    items: await readJson(path.items, []),
    run: await readJson(path.run, {})
  };
}

async function report() {
  const data = await files();
  await writeReport(path, data.profile, data.discovery, data.items, data.run);
  log(`Wrote ${path.report} and ${path.csv}`);
}

async function status() {
  const { profile, discovery, items, run } = await files();
  console.log(JSON.stringify({
    username,
    profile_fetched_at: profile?.fetched_at || null,
    profile_issues: profile?.issues || [],
    posts: { discovered: discovery.post?.items?.length || 0, complete: !!discovery.post?.complete },
    reels: { discovered: discovery.reel?.items?.length || 0, complete: !!discovery.reel?.complete },
    item_records: items.length,
    complete_item_records: items.filter((item) => item.status === 'complete').length,
    run
  }, null, 2));
}

async function login() {
  const { context, page } = await launch(root);
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
  log('Sign in in the opened Chromium window, then close that window. The session remains in collector-v2/.auth/browser.');
  await new Promise((done) => context.once('close', done));
}

async function collect() {
  const refresh = flags.has('--refresh');
  const headless = flags.has('--headless');
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice(8)) : Infinity;
  if (!Number.isInteger(limit) && limit !== Infinity || limit < 0) throw new Error('--limit must be a nonnegative integer.');
  let { profile, discovery, items, run } = await files();
  run = { ...run, started_at: now(), updated_at: now(), status: 'running', phase: 'profile', error: null };
  await writeJson(path.run, run);
  const { context, page } = await launch(root, { headless });
  try {
    log(`Collecting ${username} profile`);
    const snapshot = await captureProfile(page, username);
    const current = profileFromSnapshot(username, snapshot);
    profile = profile ? { ...profile, ...current } : current;
    await writeJson(path.profile, profile);
    for (const kind of ['post', 'reel']) {
      run = { ...run, phase: `${kind} discovery`, updated_at: now() };
      await writeJson(path.run, run);
      if (discovery[kind]?.complete && !refresh) { log(`Using saved ${kind} grid`); continue; }
      log(`Scanning ${kind} grid`);
      const prior = new Map((discovery[kind]?.items || []).map((item) => [item.url, item]));
      const result = await discover(page, username, kind, async (found, complete, error = '') => {
        for (const item of found) prior.set(item.url, { ...prior.get(item.url), ...item });
        discovery[kind] = { items: [...prior.values()], complete, error, attempted_at: now() };
        await writeJson(path.discovery, discovery);
      });
      log(`${kind}: ${result.items.length} found, ${result.complete ? 'complete' : result.error}`);
    }
    const queued = new Map();
    for (const kind of ['post', 'reel']) for (const item of discovery[kind]?.items || []) queued.set(item.url, item);
    const existing = new Map(items.map((item) => [item.url, item]));
    let attempted = 0;
    for (const item of queued.values()) {
      const old = existing.get(item.url);
      if (!refresh && old?.status === 'complete') continue;
      if (attempted >= limit) break;
      attempted++;
      run = { ...run, phase: 'item details', current_url: item.url, updated_at: now() };
      await writeJson(path.run, run);
      log(`${attempted}: ${item.kind} ${item.shortcode}`);
      try {
        const gridViews = count(item.grid_views_raw);
        const capture = await captureItem(page, item);
        const result = itemFromSnapshot(item, { ...capture, grid_views_count: gridViews?.value ?? null });
        existing.set(item.url, mergeItem(old, result));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        existing.set(item.url, { ...old, ...item, status: old?.status || 'failed', last_error: message,
          last_attempt_at: now(), attempts: (old?.attempts || 0) + 1 });
        log(`Item issue: ${message}`);
        if (/login|checkpoint|temporary limit/i.test(message)) throw error;
      }
      items = [...existing.values()];
      await writeJson(path.items, items);
      await new Promise((done) => setTimeout(done, 1600));
    }
    run = { ...run, phase: 'done', current_url: null, updated_at: now(), status: 'complete' };
    await writeJson(path.run, run);
    await writeReport(path, profile, discovery, items, run);
    log(`Done: ${items.length} items. Report: ${path.report}`);
  } catch (error) {
    run = { ...run, status: 'blocked', updated_at: now(), error: error instanceof Error ? error.message : String(error) };
    await writeJson(path.run, run);
    await writeReport(path, profile, discovery, items, run);
    throw error;
  } finally { await context.close(); }
}

try {
  if (command === 'login') await login();
  else if (command === 'collect') await collect();
  else if (command === 'status') await status();
  else if (command === 'report') await report();
  else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
