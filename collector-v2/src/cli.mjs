import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { launch, captureProfile, discover, captureItem } from './browser.mjs';
import { dayFromDescription, exactPostCount, gridCount, gridCountError, itemFromSnapshot, now, postCountError, profileFromSnapshot, profileHeaderComplete, profileLevelComplete } from './model.mjs';
import { paths, readJson, writeJson, mergeDiscoveryItems, mergeItem, mergeProfile, syncGridViews } from './store.mjs';
import { writeReport } from './report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] || 'status';
const flags = new Set(process.argv.slice(3));
const targetFile = await readJson(join(root, 'targets.json'));
const index = await readJson(resolve(root, '..', 'bot-info', 'database', 'profiles', 'index.json'));
const targets = targetFile?.profile_keys || [];
const requestedUsername = process.argv.find((arg) => arg.startsWith('--username='))?.slice(11) || targets[0];
const username = index?.profile_keys?.find((key) => key.toLowerCase() === requestedUsername?.toLowerCase());
if (!username || !/^[A-Za-z0-9._]{1,30}$/.test(username)) {
  throw new Error('Select an Instagram username present in bot-info/database/profiles/index.json.');
}
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
    posts: { count: exactPostCount(profile), error: postCountError(profile) },
    post_grid: { count: gridCount(discovery.post), error: gridCountError(discovery.post) },
    reels: { count: gridCount(discovery.reel), error: gridCountError(discovery.reel) },
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
  const profileOnly = flags.has('--profile-only');
  const skipProfile = flags.has('--skip-profile');
  if (profileOnly && (flags.has('--reels-only') || skipProfile)) throw new Error('--profile-only cannot be combined with reel flags.');
  if (skipProfile && !flags.has('--reels-only')) throw new Error('--skip-profile requires --reels-only.');
  const kinds = profileOnly ? [] : flags.has('--reels-only') ? ['reel'] : ['post', 'reel'];
  const discoveryKinds = profileOnly ? ['reel'] : kinds;
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice(8)) : Infinity;
  if (!Number.isInteger(limit) && limit !== Infinity || limit < 0) throw new Error('--limit must be a nonnegative integer.');
  let { profile, discovery, items, run } = await files();
  if (skipProfile && !profileLevelComplete(profile, discovery)) throw new Error(`Collect an exact @${username} post count and a complete reel count before running reels only.`);
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
  run = { ...run, started_at: now(), updated_at: now(), status: 'running',
    phase: skipProfile ? 'reel discovery' : 'profile',
    scope: profileOnly ? ['profile', 'reel_grid'] : skipProfile ? kinds : ['profile', ...kinds],
    current_url: null, error: null };
  await writeJson(path.run, run);
  let context;
  let profileStageComplete = skipProfile;
  try {
    const launched = await launch(root, { headless });
    context = launched.context;
    const page = launched.page;
    if (!skipProfile) {
      log(`Collecting ${username} profile`);
      const snapshot = await captureProfile(page, username);
      const current = profileFromSnapshot(username, snapshot);
      profileStageComplete = profileHeaderComplete(current) && exactPostCount(current) !== null;
      profile = mergeProfile(profile, current);
      await writeJson(path.profile, profile);
      if (!profileStageComplete) log(`Profile details are incomplete: ${postCountError(current)}`);
    } else log(`Using saved ${username} profile details`);
    for (const kind of discoveryKinds) {
      run = { ...run, phase: `${kind} discovery`, updated_at: now() };
      await writeJson(path.run, run);
      if (gridCount(discovery[kind]) !== null && !refresh) { log(`Using saved ${kind} grid`); continue; }
      if (kind === 'post' && profile.posts_count?.value === 0 && !profile.posts_count?.approximate) {
        discovery.post = { items: [], complete: true, error: '', attempted_at: now(), source: 'profile_post_count' };
        await writeJson(path.discovery, discovery);
        log('Post count is exactly zero; post grid is empty');
        continue;
      }
      log(`Scanning ${kind} grid`);
      const result = await discover(page, username, kind, async (found, complete, error = '') => {
        discovery[kind] = { items: mergeDiscoveryItems(discovery[kind]?.items || [], found, complete),
          complete, error, attempted_at: now() };
        await writeJson(path.discovery, discovery);
      });
      log(result.complete ? `${kind}: ${result.items.length} confirmed` : `${kind} count unavailable: ${result.error}`);
    }
    const queued = new Map();
    for (const kind of kinds) for (const item of discovery[kind]?.items || []) queued.set(item.url, item);
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
        existing.set(item.url, { ...mergeItem(old, result), last_error: null, last_attempt_at: now() });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        existing.set(item.url, { ...old, ...item,
          status: old?.status === 'complete' || old?.status === 'partial' ? old.status : 'failed', last_error: message,
          last_attempt_at: now(), attempts: (old?.attempts || 0) + 1 });
        log(`Item issue: ${message}`);
        if (/login|checkpoint|temporary limit/i.test(message)) throw error;
      }
      items = [...existing.values()];
      await writeJson(path.items, items);
      await new Promise((done) => setTimeout(done, 1600));
    }
    const complete = profileStageComplete && discoveryKinds.every((kind) => gridCount(discovery[kind]) !== null)
      && [...queued.keys()].every((url) => existing.get(url)?.status === 'complete' && !existing.get(url)?.last_error);
    const gridErrors = discoveryKinds.filter((kind) => gridCount(discovery[kind]) === null)
      .map((kind) => `${kind} grid: ${gridCountError(discovery[kind])}`);
    run = { ...run, phase: 'done', current_url: null, updated_at: now(), status: complete ? 'complete' : 'partial',
      error: gridErrors.join(' | ') || (!profileStageComplete
        ? postCountError(profile) || 'Profile header counts are incomplete.' : null) };
    await writeJson(path.run, run);
    await writeReport(path, profile, discovery, items, run);
    log(profileOnly ? `Done: Instagram posts ${exactPostCount(profile) ?? `error (${postCountError(profile)})`}, reels ${gridCount(discovery.reel) ?? `error (${gridCountError(discovery.reel)})`}. Report: ${path.report}`
      : `Done: ${items.length} items. Report: ${path.report}`);
  } catch (error) {
    run = { ...run, status: 'blocked', updated_at: now(), error: error instanceof Error ? error.message : String(error) };
    try { await writeJson(path.run, run); }
    catch (saveError) { log(`Could not save failure status: ${saveError.message}`); }
    try { await writeReport(path, profile, discovery, items, run); }
    catch (saveError) { log(`Could not save failure report: ${saveError.message}`); }
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
