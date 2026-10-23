import { createServer } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const dataFile = resolve(process.env.dedgram_data_file || resolve(repoRoot, 'bot-info/bot-account-info.json'));
const catalogFile = resolve(repoRoot, 'bot-info/dedgram-catalog.json');
const port = Number(process.env.dedgram_api_port || 4317);
const host = '127.0.0.1';

const now = () => new Date().toISOString();
const keyOf = (profile) => String(profile?.normalized_username || profile?.username || '').trim().toLocaleLowerCase();
const isSurfaceComplete = (p) => Boolean(p?.last_fetched_at) && String(p.status || '').toLocaleLowerCase() === 'collected';
const isNumericPostCount = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0;
  const match = String(value ?? '').trim().match(/^([\d,.]+)\s*([kmb])?(?:\s+posts?)?$/i);
  return Boolean(match && Number.isFinite(Number(match[1].replace(/,/g, ''))));
};
function isoTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' || /^\d{10,13}$/.test(String(value).trim());
  const date = new Date(numeric ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function saveData(data) {
  data.generated_at = now();
  const tempFile = `${dataFile}.${process.pid}.tmp`;
  await mkdir(dirname(dataFile), { recursive: true });
  await writeFile(tempFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(tempFile, dataFile);
}

async function loadData() {
  const [data, catalog] = await Promise.all([readJson(dataFile), readJson(catalogFile)]);
  if (!Array.isArray(data.profiles)) throw new Error('Account info JSON has no profiles list.');
  let changed = false;
  const legacyIssues = data.profiles.flatMap((profile) => (profile.collection_issues || []).map((issue) => ({ ...issue, username: issue.username || profile.username })));
  if (!Array.isArray(data.issues) || (!data.issues.length && legacyIssues.length)) { data.issues = legacyIssues; changed = true; }
  if (!data.workflow) { data.workflow = { active_job: null, recent_jobs: [] }; changed = true; }
  if (!Array.isArray(data.workflow.recent_jobs)) { data.workflow.recent_jobs = []; changed = true; }
  for (const profile of data.profiles) {
    for (const field of ['added_at', 'last_fetched_at', 'catalog_first_seen_at']) {
      const normalized = isoTimestamp(profile[field]);
      if (normalized && normalized !== profile[field]) { profile[field] = normalized; changed = true; }
    }
  }
  const byKey = new Map(data.profiles.map((profile) => [keyOf(profile), profile]));
  for (const entry of catalog.profiles || []) {
    const key = keyOf(entry);
    if (!key || byKey.has(key)) continue;
    const firstSeenAt = isoTimestamp(entry.first_seen_at) || now();
    const profile = {
      url: `https://www.instagram.com/${encodeURIComponent(entry.username)}/`,
      username: entry.username,
      bio: 'Not shown',
      country: 'Not shown',
      date_joined: 'Not shown',
      posts_count: 'Not shown',
      reels_count: 'Not shown',
      post_dates: [],
      status: 'Pending',
      ignored: false,
      last_error: '',
      added_at: firstSeenAt,
      last_fetched_at: null,
      profile_text: '',
      about_text: '',
      collection_issues: [],
      catalog_first_seen_at: firstSeenAt
    };
    data.profiles.push(profile);
    byKey.set(key, profile);
    changed = true;
  }
  if (changed) await saveData(data);
  return data;
}

function addIssue(data, profile, code, message, extra = {}) {
  const issue = {
    id: randomUUID(),
    username: profile.username,
    profile_url: profile.url,
    code,
    message,
    occurred_at: now(),
    recommended_action: 'Review the profile and retry surface or deep analysis when appropriate.',
    ...extra
  };
  data.issues.push(issue);
  profile.collection_issues ||= [];
  profile.collection_issues.push(issue);
}

function finishJob(data, status = 'completed') {
  const job = data.workflow.active_job;
  if (!job) return;
  job.status = status;
  job.updated_at = now();
  job.completed_at = now();
  data.workflow.recent_jobs.unshift(job);
  data.workflow.recent_jobs = data.workflow.recent_jobs.slice(0, 12);
  data.workflow.active_job = null;
}

function advance(job) {
  job.index += 1;
  job.stage = job.kind === 'surface' ? 'surface' : job.kind === 'post_count' ? 'post_count' : job.kind === 'reels_count' ? 'reels_count' : 'deep_profile';
  job.post_urls = [];
  job.post_index = 0;
  job.updated_at = now();
}

async function jsonBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 2_000_000) throw new Error('Request body is too large.');
  }
  return body ? JSON.parse(body) : {};
}

function send(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  response.end(JSON.stringify(payload));
}

async function route(request, response) {
  const origin = request.headers.origin;
  if (origin) {
    const allowed = origin === 'http://127.0.0.1:5173' || origin === 'http://localhost:5173' || /^moz-extension:\/\/[a-z0-9-]+$/i.test(origin);
    if (!allowed) return send(response, 403, { error: 'This local API only accepts requests from the dedgram dashboard or Firefox add-on.' });
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  if (request.method === 'OPTIONS') return send(response, 204, {});
  try {
    const pathname = new URL(request.url, `http://${host}:${port}`).pathname;
    if (request.method === 'GET' && pathname === '/api/health') return send(response, 200, { ok: true, app: 'dedgram-dashboard' });
    if (request.method === 'GET' && pathname === '/api/state') return send(response, 200, await loadData());

    if (request.method === 'POST' && pathname === '/api/jobs') {
      const body = await jsonBody(request);
      const kind = body.kind;
      if (!['surface', 'deep', 'post_count', 'reels_count'].includes(kind)) return send(response, 400, { error: 'Choose surface, deep, post count, or reel count analysis.' });
      const data = await loadData();
      if (data.workflow.active_job) return send(response, 409, { error: 'A collection job is already running.' });
      const selected = [...new Set((body.profile_keys || []).map((value) => String(value).toLocaleLowerCase()))];
      const profiles = selected.map((key) => data.profiles.find((p) => keyOf(p) === key)).filter(Boolean);
      if (!profiles.length || profiles.length !== selected.length) return send(response, 400, { error: 'Select at least one valid profile.' });
      if (profiles.some((profile) => profile.ignored)) return send(response, 400, { error: 'Unignore selected profiles before starting analysis.' });
      if (kind === 'deep' && profiles.some((profile) => !isSurfaceComplete(profile))) {
        return send(response, 400, { error: 'Deep analysis can only run for profiles with completed surface analysis.' });
      }
      if (kind === 'post_count' && profiles.some((profile) => isNumericPostCount(profile.posts_count))) {
        return send(response, 400, { error: 'Post count refresh only accepts profiles whose post count is missing.' });
      }
      const job = {
        id: randomUUID(), kind, status: 'running', profile_keys: profiles.map(keyOf),
        index: 0, stage: kind === 'surface' ? 'surface' : kind === 'post_count' ? 'post_count' : kind === 'reels_count' ? 'reels_count' : 'deep_profile', post_urls: [], post_index: 0,
        started_at: now(), updated_at: now(), completed_at: null, last_activity_at: null
      };
      data.workflow.active_job = job;
      await saveData(data);
      return send(response, 202, { job });
    }

    if (request.method === 'POST' && pathname === '/api/profiles/ignore') {
      const body = await jsonBody(request);
      const data = await loadData();
      if (data.workflow.active_job?.profile_keys.includes(String(body.profile_key || '').toLocaleLowerCase())) {
        return send(response, 409, { error: 'Stop the active job before changing one of its profiles.' });
      }
      const profile = data.profiles.find((p) => keyOf(p) === String(body.profile_key || '').toLocaleLowerCase());
      if (!profile) return send(response, 404, { error: 'Profile not found.' });
      profile.ignored = Boolean(body.ignored);
      await saveData(data);
      return send(response, 200, { ok: true, ignored: profile.ignored });
    }

    if (request.method === 'POST' && pathname === '/api/jobs/cancel') {
      const data = await loadData();
      if (!data.workflow.active_job) return send(response, 409, { error: 'There is no active job.' });
      finishJob(data, 'cancelled');
      await saveData(data);
      return send(response, 200, { ok: true });
    }

    if (request.method === 'GET' && pathname === '/api/extension/next') {
      const data = await loadData();
      const job = data.workflow.active_job;
      if (!job) return send(response, 200, { idle: true });
      if (job.index >= job.profile_keys.length) {
        finishJob(data);
        await saveData(data);
        return send(response, 200, { idle: true });
      }
      const profile = data.profiles.find((p) => keyOf(p) === job.profile_keys[job.index]);
      if (!profile) {
        addIssue(data, { username: job.profile_keys[job.index], url: '' }, 'PROFILE_MISSING', 'Queued profile no longer exists in the account info file.');
        advance(job);
        await saveData(data);
        return send(response, 200, { idle: true });
      }
      job.last_activity_at = now();
      const step = { job_id: job.id, profile_key: keyOf(profile), url: profile.url, username: profile.username };
      if (job.kind === 'surface') {
        step.stage = 'surface';
      } else if (job.kind === 'post_count') {
        step.stage = 'post_count';
      } else if (job.kind === 'reels_count') {
        step.stage = 'reels_count';
      } else if (job.stage === 'deep_profile') {
        step.stage = 'deep_profile';
      } else if (job.stage === 'deep_post') {
        if (job.post_index >= job.post_urls.length) {
          advance(job);
          if (job.index >= job.profile_keys.length) {
            finishJob(data);
            await saveData(data);
            return send(response, 200, { idle: true });
          }
          await saveData(data);
          return send(response, 200, { idle: true });
        }
        step.stage = 'deep_post';
        step.post_url = job.post_urls[job.post_index];
      }
      await saveData(data);
      return send(response, 200, { idle: false, step });
    }

    if (request.method === 'POST' && pathname === '/api/extension/result') {
      const body = await jsonBody(request);
      const data = await loadData();
      const job = data.workflow.active_job;
      if (!job || job.id !== body.job_id) return send(response, 409, { error: 'The active job has changed.' });
      const profile = data.profiles.find((p) => keyOf(p) === String(body.profile_key || '').toLocaleLowerCase());
      if (!profile) return send(response, 404, { error: 'Queued profile not found.' });
      if (job.kind === 'surface' && body.stage === 'surface') {
        const result = body.result || {};
        Object.assign(profile, {
          url: profile.url || `https://www.instagram.com/${encodeURIComponent(profile.username)}/`,
          bio: result.bio ?? 'Not shown', country: result.country ?? 'Not shown', date_joined: result.date_joined ?? 'Not shown',
          posts_count: result.posts_count ?? 'Not shown', status: result.status || 'Collected', last_error: result.last_error || '',
          last_fetched_at: now(), profile_text: result.profile_text || '', about_text: result.about_text || ''
        });
        profile.collection_issues = [];
        const issueCodes = new Set();
        for (const issue of result.issues || []) {
          const code = issue.code || 'SURFACE_FIELD_UNAVAILABLE';
          issueCodes.add(code);
          addIssue(data, profile, code, issue.message || 'A surface field could not be read.');
        }
        if ((!result.posts_count || result.posts_count === 'Not shown') && !issueCodes.has('POST_COUNT_UNAVAILABLE')) {
          addIssue(data, profile, 'POST_COUNT_UNAVAILABLE', 'The displayed post count could not be identified in the profile header.');
        }
        if ((!result.date_joined || result.date_joined === 'Not shown') && !issueCodes.has('DATE_JOINED_UNAVAILABLE')) {
          addIssue(data, profile, 'DATE_JOINED_UNAVAILABLE', 'The Date joined value could not be identified in About this account.');
        }
        if (result.error) addIssue(data, profile, 'SURFACE_ANALYSIS_FAILED', result.error);
        advance(job);
      } else if (job.kind === 'post_count' && body.stage === 'post_count' && job.stage === 'post_count') {
        const result = body.result || {};
        const count = result.posts_count;
        if (isNumericPostCount(count)) {
          profile.posts_count = String(count).trim();
          const isPostCountIssue = (issue) => issue.code === 'POST_COUNT_UNAVAILABLE' && keyOf({ username: issue.username || issue.profile_key }) === keyOf(profile);
          profile.collection_issues = (profile.collection_issues || []).filter((issue) => !isPostCountIssue(issue));
          data.issues = data.issues.filter((issue) => !isPostCountIssue(issue));
        } else {
          addIssue(data, profile, 'POST_COUNT_UNAVAILABLE', result.error || 'Could not identify the post count in the profile header.', {
            recommended_action: 'Retry the post count refresh when the profile is available.'
          });
        }
        advance(job);
      } else if (job.kind === 'reels_count' && body.stage === 'reels_count' && job.stage === 'reels_count') {
        const result = body.result || {};
        const count = result.reels_count;
        profile.reels_count_last_attempt_at = now();
        if (Number.isSafeInteger(count) && count >= 0 && result.complete === true) {
          profile.reels_count = count;
          profile.reels_count_status = 'Complete';
          const isReelCountIssue = (issue) => issue.code === 'REELS_COUNT_SCAN_INCOMPLETE' && keyOf({ username: issue.username || issue.profile_key }) === keyOf(profile);
          profile.collection_issues = (profile.collection_issues || []).filter((issue) => !isReelCountIssue(issue));
          data.issues = data.issues.filter((issue) => !isReelCountIssue(issue));
        } else {
          profile.reels_count_status = 'Incomplete';
          addIssue(data, profile, 'REELS_COUNT_SCAN_INCOMPLETE', result.error || 'The Reels tab did not reach a confirmed end; the partial count was not saved.', {
            recommended_action: 'Review the Reels tab for loading or access errors, then retry the reel count scan.'
          });
        }
        advance(job);
      } else if (job.kind === 'deep' && body.stage === 'deep_profile' && job.stage === 'deep_profile') {
        const postUrls = Array.isArray(body.result?.post_urls) ? [...new Set(body.result.post_urls.filter((url) => typeof url === 'string' && /^https:\/\/www\.instagram\.com\/(p|reel|tv)\//.test(url)))] : [];
        job.post_urls = postUrls;
        job.post_index = 0;
        job.stage = 'deep_post';
        profile.post_dates = [];
        profile.deep_status = body.result?.error ? 'Failed' : 'Collecting';
        if (body.result?.error) addIssue(data, profile, 'DEEP_PROFILE_SCAN_FAILED', body.result.error);
        if (!postUrls.length) {
          profile.post_dates = [];
          profile.deep_status = body.result?.error ? 'Failed' : 'Collected';
          if (!/^0(?:[.,]0+)?$/.test(String(profile.posts_count || ''))) addIssue(data, profile, 'POST_LINKS_UNAVAILABLE', 'No post links were found while scrolling this profile.');
        }
      } else if (job.kind === 'deep' && body.stage === 'deep_post' && job.stage === 'deep_post') {
        const url = job.post_urls[job.post_index];
        const date = body.result?.date || 'Not shown';
        profile.post_dates ||= [];
        const existing = profile.post_dates.findIndex((item) => item.url === url);
        const record = { url, date };
        if (existing >= 0) profile.post_dates[existing] = record;
        else profile.post_dates.push(record);
        if (date === 'Not shown' || body.result?.error) addIssue(data, profile, 'POST_DATE_UNAVAILABLE', body.result?.error || 'The post date could not be identified.', { post_url: url });
        job.post_index += 1;
        if (job.post_index >= job.post_urls.length) {
          profile.deep_status = 'Collected';
          advance(job);
        }
      } else {
        return send(response, 409, { error: 'Result does not match the active workflow step.' });
      }
      job.updated_at = now();
      await saveData(data);
      return send(response, 200, { ok: true });
    }

    return send(response, 404, { error: 'Not found.' });
  } catch (error) {
    return send(response, 500, { error: error?.message || 'Internal server error.' });
  }
}

createServer((request, response) => { void route(request, response); }).listen(port, host, () => {
  console.log(`dedgram API ready at http://${host}:${port}`);
  console.log(`Data file: ${dataFile}`);
});
