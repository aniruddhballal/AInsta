import test from 'node:test';
import assert from 'node:assert/strict';
import { profileSummary } from '../ui/data.mjs';
import { renderProfile } from '../ui/public/profile.js';
import { gridLabel } from '../ui/public/shared.js';

test('the profile page never displays a partial grid count as a result', () => {
  const discovery = { post: { items: [{ url: 'one' }, { url: 'two' }], complete: false,
    error: 'Grid scan stopped early.' }, reel: { items: [{ url: 'one' }], complete: false,
    error: 'Reel scan stopped early.' } };
  const profile = { username: 'example', fetched_at: '2026-10-23T00:00:00Z',
    raw: { header_text: 'example\n2,894 posts\n10 followers\n0 following' },
    posts_count: { value: 2894, raw: '2,894' }, followers_count: { value: 10, raw: '10' },
    following_count: { value: 0, raw: '0' } };
  const data = { username: 'example', profile, discovery, items: [], run: { status: 'partial' } };
  const summary = profileSummary(data);
  assert.equal(summary.posts.discovered, null);
  assert.equal(summary.posts.grid_error, 'Grid scan stopped early.');
  assert.equal(gridLabel({ discovered: null, grid_complete: false,
    grid_error: 'Grid has not been scanned.' }), 'Not scanned');
  assert.equal(gridLabel({ discovered: null, grid_complete: false,
    grid_error: 'Grid scan did not finish.' }, { status: 'running', phase: 'reel discovery' }), 'Counting');
  assert.equal(gridLabel({ discovered: null, grid_complete: false,
    grid_error: 'Reel scan stopped early.' }), 'Error');
  const html = renderProfile({ detail: { ...data, summary }, itemSearch: '', itemFilter: 'all',
    itemSort: 'newest', batch: null, error: null });
  assert.match(html, /INSTAGRAM POSTS<\/span><strong>2,894<\/strong>/);
  assert.match(html, /REELS IN GRID<\/span><strong>Error<\/strong>/);
  assert.doesNotMatch(html, /2\+|>2 posts/);
});
