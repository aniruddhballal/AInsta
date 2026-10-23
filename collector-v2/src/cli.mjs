import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { launch, captureProfile, discover, captureItem } from './browser.mjs';
import { dayFromDescription, itemFromSnapshot, now, profileFromSnapshot } from './model.mjs';
import { paths, readJson, writeJson, mergeItem, mergeProfile, syncGridViews } from './store.mjs';
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
const exec = promisify(execFile);

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

async function importFirefox() {
  const helper = join(root, 'src', 'firefox-cookies.py');
  const pathArg = process.argv.find((arg) => arg.startsWith('--profile='))?.slice(10);
  const candidatePythons = process.env.DEDGRAM_PYTHON ? [process.env.DEDGRAM_PYTHON]
    : [resolve(root, '..', '.venv', 'Scripts', 'python.exe'), 'python3', 'python'];
  let output;
  let lastError;
  for (const python of candidatePythons) {
    try { output = (await exec(python, [helper, ...(pathArg ? [pathArg] : [])], { maxBuffer: 1024 * 1024 })).stdout; break; }
    catch (error) { lastError = error; }
  }
  if (!output) throw lastError || new Error('No Firefox Instagram cookies found.');
  const cookies = JSON.parse(output);
  if (!cookies.some((cookie) => cookie.name === 'sessionid')) throw new Error('Firefox does not have a usable Instagram session cookie.');
  const { context, page } = await launch(root, { headless: true });
  try {
    await context.addCookies(cookies);
    await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1800);
    const text = (await page.locator('body').innerText()).slice(0, 500);
    if (/^Log In\s+Sign Up/i.test(text) || /\/accounts\/login/.test(page.url())) {
      throw new Error('Imported cookies did not produce a signed in page; use npm run login instead.');
    }
    log(`Imported ${cookies.length} Instagram cookies into the isolated browser profile. No cookie values were printed.`);
  } finally { await context.close(); }
}

async function collect() {
  const refresh = flags.has('--refresh');
  const headless = flags.has('--headless');
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice(8)) : Infinity;
  if (!Number.isInteger(limit) && limit !== Infinity || limit < 0) throw new Error('--limit must be a nonnegative integer.');
  let { profile, discovery, items, run } = await files();
  let corrected = false;
  items = items.map((item) => {
    const day = item.date_precision === 'day' ? dayFromDescription(item.raw?.description) : null;
    if (!day || day === item.date) {
      if (!item.date_precision && /^\d{4}-\d{2}-\d{2}T/.test(item.date || '')) {
        corrected = true;
        return { ...item, date_precision: 'timestamp' };
      }
      return item;
    }
    corrected = true;
    return { ...item, date: day };
  });
  if (corrected) await writeJson(path.items, items);
  run = { ...run, started_at: now(), updated_at: now(), status: 'running', phase: 'profile', error: null };
  await writeJson(path.run, run);
  let context;
  try {
    const launched = await launch(root, { headless });
    context = launched.context;
    const page = launched.page;
    log(`Collecting ${username} profile`);
    const snapshot = await captureProfile(page, username);
    const current = profileFromSnapshot(username, snapshot);
    profile = mergeProfile(profile, current);
    await writeJson(path.profile, profile);
    for (const kind of ['post', 'reel']) {
      run = { ...run, phase: `${kind} discovery`, updated_at: now() };
      await writeJson(path.run, run);
      if (discovery[kind]?.complete && !refresh) { log(`Using saved ${kind} grid`); continue; }
      if (kind === 'post' && profile.posts_count?.value === 0 && !profile.posts_count?.approximate) {
        discovery.post = { items: [], complete: true, error: '', attempted_at: now(), source: 'profile_post_count' };
        await writeJson(path.discovery, discovery);
        log('Post count is exactly zero; post grid is empty');
        continue;
      }
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
    for (const item of queued.values()) {
      const old = existing.get(item.url);
      if (old) existing.set(item.url, syncGridViews(old, item, discovery[item.kind]?.attempted_at || now()));
      else existing.set(item.url, { ...item, status: 'pending' });
    }
    items = [...existing.values()];
    await writeJson(path.items, items);
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
        const capture = await captureItem(page, item);
        const result = itemFromSnapshot(item, { ...capture, grid_views_raw: item.grid_views_raw });
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
    const complete = ['post', 'reel'].every((kind) => discovery[kind]?.complete)
      && [...queued.keys()].every((url) => existing.get(url)?.status === 'complete');
    run = { ...run, phase: 'done', current_url: null, updated_at: now(), status: complete ? 'complete' : 'partial' };
    await writeJson(path.run, run);
    await writeReport(path, profile, discovery, items, run);
    log(`Done: ${items.length} items. Report: ${path.report}`);
  } catch (error) {
    run = { ...run, status: 'blocked', updated_at: now(), error: error instanceof Error ? error.message : String(error) };
    await writeJson(path.run, run);
    await writeReport(path, profile, discovery, items, run);
    throw error;
  } finally { if (context) await context.close(); }
}

try {
  if (command === 'login') await login();
  else if (command === 'import-firefox') await importFirefox();
  else if (command === 'collect') await collect();
  else if (command === 'status') await status();
  else if (command === 'report') await report();
  else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
