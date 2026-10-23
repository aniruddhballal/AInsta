import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const FORMAT = 'dedgram-bot-account-info';
const keyOf = (profile) => String(profile?.normalized_username || profile?.username || '').trim().toLocaleLowerCase();
const fileKey = (value) => `profile-${encodeURIComponent(String(value).toLocaleLowerCase())}`;
const issueProfileKey = (issue) => String(issue?.username || issue?.profile_key || 'unassigned').trim().toLocaleLowerCase() || 'unassigned';

let boundDirectory = '';
let knownFiles = new Map();
let writeQueue = Promise.resolve();

async function readOptionalJson(path) {
  try {
    const contents = await readFile(path, 'utf8');
    knownFiles.set(path, contents);
    return JSON.parse(contents);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(path, value) {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  if (knownFiles.get(path) === contents) return;
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, contents, 'utf8');
  await rename(tempPath, path);
  knownFiles.set(path, contents);
}

async function removeObsoleteFiles(expectedPaths) {
  for (const path of knownFiles.keys()) {
    if (path === boundDirectory || expectedPaths.has(path)) continue;
    await rm(path, { force: true });
    knownFiles.delete(path);
  }
}

function profileFiles(profile) {
  const {
    deep_status, post_dates, post_records, reel_records,
    posts_data_status, posts_data_last_fetched_at,
    reels_data_status, reels_data_last_fetched_at,
    collection_issues, ...core
  } = profile;
  return {
    core,
    deep: { status: deep_status, post_dates: post_dates || [] },
    posts: { status: posts_data_status, last_fetched_at: posts_data_last_fetched_at, records: post_records || [] },
    reels: { status: reels_data_status, last_fetched_at: reels_data_last_fetched_at, records: reel_records || [] },
    currentIssues: collection_issues || []
  };
}

export async function readDataStore(directory) {
  boundDirectory = directory;
  knownFiles = new Map();
  const metaPath = join(directory, 'meta.json');
  const profileIndexPath = join(directory, 'profiles', 'index.json');
  const workflowPath = join(directory, 'workflow.json');
  const issuesIndexPath = join(directory, 'issues', 'history-index.json');
  const [meta, profileIndex, workflow, issueIndex] = await Promise.all([
    readOptionalJson(metaPath), readOptionalJson(profileIndexPath), readOptionalJson(workflowPath), readOptionalJson(issuesIndexPath)
  ]);
  if (!profileIndex) return null;

  const profileKeys = Array.isArray(profileIndex.profile_keys) ? profileIndex.profile_keys : [];
  const profiles = await Promise.all(profileKeys.map(async (key) => {
    const filename = fileKey(key);
    const [core, deep, posts, reels, currentIssues] = await Promise.all([
      readOptionalJson(join(directory, 'profiles', `${filename}.json`)),
      readOptionalJson(join(directory, 'deep-analysis', `${filename}.json`)),
      readOptionalJson(join(directory, 'content', 'posts', `${filename}.json`)),
      readOptionalJson(join(directory, 'content', 'reels', `${filename}.json`)),
      readOptionalJson(join(directory, 'issues', 'profiles', `${filename}.json`))
    ]);
    if (!core) return null;
    return {
      ...core,
      deep_status: deep?.status,
      post_dates: deep?.post_dates || [],
      posts_data_status: posts?.status,
      posts_data_last_fetched_at: posts?.last_fetched_at,
      post_records: posts?.records || [],
      reels_data_status: reels?.status,
      reels_data_last_fetched_at: reels?.last_fetched_at,
      reel_records: reels?.records || [],
      collection_issues: currentIssues?.issues || []
    };
  }));
  const validProfiles = profiles.filter(Boolean);
  const issues = await Promise.all((issueIndex?.issues || []).map(async ({ id, profile_key }) => {
    const issue = await readOptionalJson(join(directory, 'issues', 'history', fileKey(profile_key), `${encodeURIComponent(id)}.json`));
    return issue ? { ...issue, id: issue.id || id } : null;
  }));
  const orderedIssues = issues.filter(Boolean);

  return {
    format: meta?.format || FORMAT,
    version: meta?.version || 1,
    generated_at: meta?.generated_at,
    profiles: validProfiles,
    issues: orderedIssues,
    workflow: workflow || { active_job: null, recent_jobs: [] }
  };
}

async function writeDataStoreNow(data, directory) {
  if (boundDirectory !== directory) {
    boundDirectory = directory;
    knownFiles = new Map();
  }
  await mkdir(directory, { recursive: true });
  data.format = FORMAT;
  data.version = 1;
  data.generated_at = new Date().toISOString();
  const entries = new Map();
  const profileKeys = [];
  const allIssueIndex = [];

  for (const profile of data.profiles || []) {
    const key = keyOf(profile);
    if (!key) continue;
    profileKeys.push(key);
    profile.collection_issues ||= [];
    const filename = fileKey(key);
    const split = profileFiles(profile);
    entries.set(join(directory, 'profiles', `${filename}.json`), split.core);
    entries.set(join(directory, 'deep-analysis', `${filename}.json`), split.deep);
    entries.set(join(directory, 'content', 'posts', `${filename}.json`), split.posts);
    entries.set(join(directory, 'content', 'reels', `${filename}.json`), split.reels);
    if (split.currentIssues.length) {
      entries.set(join(directory, 'issues', 'profiles', `${filename}.json`), { issues: split.currentIssues });
    }
  }

  for (const issue of data.issues || []) {
    issue.id ||= randomUUID();
    const key = issueProfileKey(issue);
    allIssueIndex.push({ id: issue.id, profile_key: key });
    entries.set(join(directory, 'issues', 'history', fileKey(key), `${encodeURIComponent(issue.id)}.json`), issue);
  }

  const profileIndexPath = join(directory, 'profiles', 'index.json');
  const issueIndexPath = join(directory, 'issues', 'history-index.json');
  const metaPath = join(directory, 'meta.json');
  const workflowPath = join(directory, 'workflow.json');
  entries.set(workflowPath, data.workflow || { active_job: null, recent_jobs: [] });

  const expected = new Set([...entries.keys(), profileIndexPath, issueIndexPath, metaPath]);
  for (const [path, value] of entries) await writeJson(path, value);
  await removeObsoleteFiles(expected);
  await writeJson(profileIndexPath, { profile_keys: profileKeys });
  await writeJson(issueIndexPath, { issues: allIssueIndex });
  await writeJson(metaPath, { format: FORMAT, version: 1, generated_at: data.generated_at });
}

export function writeDataStore(data, directory) {
  writeQueue = writeQueue.then(() => writeDataStoreNow(data, directory));
  return writeQueue;
}

export async function importLegacyData(sourceFile, directory) {
  const legacy = JSON.parse(await readFile(sourceFile, 'utf8'));
  if (!Array.isArray(legacy.profiles)) throw new Error('Legacy account info JSON has no profiles list.');
  legacy.issues = Array.isArray(legacy.issues) ? legacy.issues : [];
  legacy.workflow ||= { active_job: null, recent_jobs: [] };
  legacy.workflow.recent_jobs ||= [];
  await writeDataStore(legacy, directory);
  return legacy;
}

export async function fileExists(path) {
  try { await readFile(path); return true; }
  catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}

