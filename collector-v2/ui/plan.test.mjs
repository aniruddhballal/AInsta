import test from 'node:test';
import assert from 'node:assert/strict';
import { resultStatus, stepsFor } from './plan.mjs';

const selected = ['alpha', 'beta'];
const labels = (mode) => stepsFor(selected, mode).map(({ username, stage }) => `${username}:${stage}`);

test('collection strategies schedule profile and reel stages in the requested order', () => {
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
