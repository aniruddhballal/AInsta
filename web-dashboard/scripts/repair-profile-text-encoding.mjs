import { readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const defaultDirectory = resolve(here, '../../bot-info/database/profiles');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const pathArg = args.find((arg) => arg !== '--apply');
const targetPath = resolve(pathArg || defaultDirectory);

// These code points are the Windows-1252 characters for byte values 0x80–0x9f.
const cp1252Extension = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178
].map((point) => String.fromCodePoint(point));
const cp1252Bytes = new Map();
for (let byte = 0; byte < 256; byte += 1) {
  cp1252Bytes.set(byte >= 0x80 && byte <= 0x9f ? cp1252Extension[byte - 0x80] : String.fromCharCode(byte), byte);
}

function decodeOneLayer(value) {
  const bytes = [];
  for (const character of value) {
    const byte = cp1252Bytes.get(character);
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return null;
  }
}

function recover(value) {
  let text = value;
  let passes = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const next = decodeOneLayer(text);
    if (next === null || next === text) break;
    text = next;
    passes += 1;
  }
  return passes === 4 ? text : value;
}

const targetStat = await stat(targetPath);
const profileFiles = targetStat.isDirectory()
  ? (await readdir(targetPath, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'index.json').map((entry) => resolve(targetPath, entry.name))
  : [targetPath];
const changed = [];
for (const profileFile of profileFiles) {
  const data = JSON.parse(await readFile(profileFile, 'utf8'));
  const profiles = Array.isArray(data.profiles) ? data.profiles : data.username ? [data] : null;
  if (!profiles) throw new Error(`The selected JSON file has no profile record: ${profileFile}`);
  let fileChanged = false;
  for (const profile of profiles) {
    const fields = [];
    for (const field of ['bio', 'profile_text', 'about_text']) {
      if (typeof profile[field] !== 'string' || !profile[field]) continue;
      const recovered = recover(profile[field]);
      if (recovered !== profile[field]) {
        profile[field] = recovered;
        fields.push(field);
      }
    }
    if (fields.length) {
      changed.push({ username: profile.username || '(unknown)', fields });
      fileChanged = true;
    }
  }
  if (apply && fileChanged) {
    const tempFile = `${profileFile}.${process.pid}.tmp`;
    await writeFile(tempFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await rename(tempFile, profileFile);
  }
}

console.log(`${apply ? 'Repaired' : 'Would repair'} ${changed.reduce((sum, item) => sum + item.fields.length, 0)} text field(s) across ${changed.length} profile(s) in ${targetPath}.`);
for (const item of changed) console.log(`@${item.username}: ${item.fields.join(', ')}`);
if (apply && changed.length) console.log('Updated the affected profile JSON files atomically.');
