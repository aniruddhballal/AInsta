import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { fileExists, importLegacyData, readDataStore } from '../storage.mjs';

const defaultSource = fileURLToPath(new URL('../../bot-info/bot-account-info.json', import.meta.url));
const defaultTarget = fileURLToPath(new URL('../../bot-info/database', import.meta.url));
const sourcePath = resolve(process.argv[2] || defaultSource);
const targetPath = resolve(process.argv[3] || defaultTarget);
if (await fileExists(resolve(targetPath, 'profiles', 'index.json'))) {
  throw new Error(`The data store already exists at ${targetPath}; refusing to overwrite it.`);
}

const data = await importLegacyData(sourcePath, targetPath);
const migrated = await readDataStore(targetPath);
const splitFields = new Set(['deep_status', 'post_dates', 'post_records', 'reel_records', 'posts_data_status', 'posts_data_last_fetched_at', 'reels_data_status', 'reels_data_last_fetched_at', 'collection_issues']);
const coreFields = (profile) => Object.fromEntries(Object.entries(profile).filter(([field]) => !splitFields.has(field)));
if (migrated.profiles.length !== data.profiles.length || !isDeepStrictEqual(migrated.issues, data.issues) || !isDeepStrictEqual(migrated.workflow, data.workflow)) {
  throw new Error('Migration verification failed: profile, issue-history, or workflow data differs after reload.');
}
for (const original of data.profiles) {
  const profile = migrated.profiles.find((candidate) => candidate.username.toLocaleLowerCase() === original.username.toLocaleLowerCase());
  if (!profile || !isDeepStrictEqual(coreFields(profile), coreFields(original))
    || !isDeepStrictEqual(profile.post_dates || [], original.post_dates || [])
    || !isDeepStrictEqual(profile.post_records || [], original.post_records || [])
    || !isDeepStrictEqual(profile.reel_records || [], original.reel_records || [])
    || !isDeepStrictEqual(profile.collection_issues || [], original.collection_issues || [])) {
    throw new Error(`Migration verification failed for @${original.username}.`);
  }
}
const postRecords = data.profiles.reduce((total, profile) => total + (profile.post_records || []).length, 0);
const reelRecords = data.profiles.reduce((total, profile) => total + (profile.reel_records || []).length, 0);
const deepDates = data.profiles.reduce((total, profile) => total + (profile.post_dates || []).length, 0);
console.log(`Migrated ${data.profiles.length} profiles, ${data.issues.length} issue records, ${postRecords} post records, ${reelRecords} reel records, and ${deepDates} deep-analysis dates.`);
console.log('Reload verification passed: profile fields, analysis records, issues, and workflow state are preserved.');
console.log(`Data store: ${targetPath}`);
