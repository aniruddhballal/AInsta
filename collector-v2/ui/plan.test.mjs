import test from 'node:test';
import assert from 'node:assert/strict';
import { orderProfiles, resultStatus, stepsFor } from './plan.mjs';

const selected = ['alpha', 'beta'];
const labels = (mode) => stepsFor(selected, mode).map(({ username, stage }) => `${username}:${stage}`);

test('collection strategies schedule profile and reel stages in the requested order', () => {
  assert.deepEqual(labels('profile_header'), ['alpha:profile_header', 'beta:profile_header']);
  assert.deepEqual(labels('reel_grid'), ['alpha:reel_grid', 'beta:reel_grid']);
  assert.deepEqual(labels('reel_details'), ['alpha:reels', 'beta:reels']);
  assert.deepEqual(labels('profile_only'), ['alpha:profile', 'beta:profile']);
  assert.deepEqual(labels('depth_first'), ['alpha:profile', 'alpha:reels', 'beta:profile', 'beta:reels']);
  assert.deepEqual(labels('breadth_first'), ['alpha:profile', 'beta:profile', 'alpha:reels', 'beta:reels']);
  assert.deepEqual(labels('reels_only'), ['alpha:reels', 'beta:reels']);
  assert.throws(() => stepsFor(selected, 'unknown'), /valid collection mode/);
});

test('a profile result reflects incomplete and review stages', () => {
  assert.equal(resultStatus({ profile: { status: 'complete' }, reels: { status: 'queued' } }), 'queued');
  assert.equal(resultStatus({ profile: { status: 'complete' }, reels: { status: 'running' } }), 'running');
  assert.equal(resultStatus({ profile: { status: 'complete' }, reels: { status: 'needs_review' } }), 'needs_review');
  assert.equal(resultStatus({ profile: { status: 'failed' }, reels: { status: 'skipped' } }), 'failed');
  assert.equal(resultStatus({ profile: { status: 'complete' }, reels: { status: 'complete' } }), 'complete');
});

test('post count order sorts saved exact counts and puts unknown counts last', () => {
  const selected = ['unknown', 'large', 'zero', 'small', 'tied', 'another_unknown'];
  const counts = new Map([['large', 500], ['zero', 0], ['small', 10], ['tied', 10]]);
  assert.deepEqual(orderProfiles(selected, 'posts_ascending', counts),
    ['zero', 'small', 'tied', 'large', 'unknown', 'another_unknown']);
  assert.deepEqual(orderProfiles(selected, 'selection', counts), selected);
  assert.throws(() => orderProfiles(selected, 'other', counts), /valid profile order/);
});
