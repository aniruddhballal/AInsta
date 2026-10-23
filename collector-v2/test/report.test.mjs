import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeReport } from '../src/report.mjs';

test('profile-only exports grid counts without item records', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dedgram-report-'));
  const paths = { base, csv: join(base, 'items.csv'), profileCsv: join(base, 'profile.csv'), report: join(base, 'report.html') };
  const profile = { username: 'example', fetched_at: '2026-10-23T00:00:00Z',
    posts_count: { value: 5, raw: '5' }, followers_count: { value: 10, raw: '10' }, following_count: { value: 0, raw: '0' } };
  const discovery = { post: { items: [{}, {}, {}], complete: true }, reel: { items: [{}, {}], complete: true } };
  try {
    await writeReport(paths, profile, discovery, [], { status: 'complete' });
    const html = await readFile(paths.report, 'utf8');
    const csv = await readFile(paths.profileCsv, 'utf8');
    assert.match(html, /Discovered posts<\/dt><dd>3/);
    assert.match(html, /Discovered reels<\/dt><dd>2/);
    assert.match(csv, /post_grid_count.*reel_grid_count/);
    assert.match(csv, /,"3","true","2","true"/);
  } finally {
    await Promise.all([paths.csv, paths.profileCsv, paths.report].map((file) => unlink(file).catch(() => {})));
    await rmdir(base);
  }
});
