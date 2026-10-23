import test from 'node:test';
import assert from 'node:assert/strict';
import { count, profileFromSnapshot, canonicalItemUrl, itemFromSnapshot } from '../src/model.mjs';
import { mergeItem, mergeProfile } from '../src/store.mjs';

test('counts retain whether the source displayed a rounded value', () => {
  assert.deepEqual(count('20.7K'), { value: 20700, raw: '20.7K', approximate: true });
  assert.deepEqual(count('1,234'), { value: 1234, raw: '1,234', approximate: false });
  assert.equal(count('Not shown'), null);
});

test('profile extracts the sample account fields', () => {
  const result = profileFromSnapshot('edlt.shox', {
    header_text: 'edlt.shox\n🗽\n0 posts\n20.7K followers\n0 following\nReel creator •\nAI-generated profile\nFollow',
    about_text: 'About this account\nDate joined\nSeptember 2026\nAccount based in\nTajikistan\nFormer usernames\n13'
  });
  assert.equal(result.posts_count.value, 0);
  assert.equal(result.followers_count.value, 20700);
  assert.equal(result.following_count.value, 0);
  assert.equal(result.date_joined, 'September 2026');
  assert.equal(result.account_based_in, 'Tajikistan');
  assert.equal(result.former_usernames_count.value, 13);
  assert.equal(result.category, 'Reel creator');
  assert.equal(result.ai_generated_profile, true);
});

test('profile reads post count from page metadata when the public header omits it', () => {
  const result = profileFromSnapshot('edlt.shox', { header_text: 'edlt.shox\n22.2K followers\n0 following',
    description: '20K Followers, 49 Following, 0 Posts - account on Instagram' });
  assert.equal(result.posts_count.value, 0);
  assert.equal(result.following_count.value, 0);
  assert.equal(mergeProfile({ date_joined: 'September 2026' }, result).date_joined, 'September 2026');
});

test('canonical items strip tracking parameters and reject foreign hosts', () => {
  assert.deepEqual(canonicalItemUrl('https://www.instagram.com/reels/Ab-12_/?foo=bar'), {
    kind: 'reel', shortcode: 'Ab-12_', url: 'https://www.instagram.com/reel/Ab-12_/'
  });
  assert.equal(canonicalItemUrl('https://example.com/reel/Ab-12_/'), null);
  assert.equal(canonicalItemUrl('https://www.instagram.com/edlt.shox/reel/Ab-12_/')?.url,
    'https://www.instagram.com/reel/Ab-12_/');
});

test('item parses published date, caption, engagement and source', () => {
  const result = itemFromSnapshot({ kind: 'reel', shortcode: 'XYZ', url: 'https://www.instagram.com/reel/XYZ/' }, {
    datetime: '2026-10-01T02:00:00.000Z',
    og_description: '1,234 likes, 56 comments - edlt.shox on October 1, 2026: "Hello #world @friend"',
    article_text: '9.2K views',
    json_ld: []
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.likes.value, 1234);
  assert.equal(result.comments.value, 56);
  assert.equal(result.views.value, 9200);
  assert.deepEqual(result.hashtags, ['#world']);
  assert.deepEqual(result.mentions, ['@friend']);
  assert.equal(result.date_precision, 'timestamp');
});

test('item keeps date-only evidence at day precision', () => {
  const result = itemFromSnapshot({ kind: 'reel' }, { og_description: '5 likes, 2 comments - edlt.shox on October 22, 2026: "Caption"',
    grid_views_raw: '1.2K', article_text: 'No timestamp shown' });
  assert.equal(result.date, '2026-10-22');
  assert.equal(result.date_precision, 'day');
  assert.equal(result.status, 'complete');
});

test('a grid view estimate keeps its original rounded notation', () => {
  const result = itemFromSnapshot({ kind: 'reel' }, { grid_views_raw: '35.6K', datetime: '2026-10-01',
    og_description: '2 likes, 1 comment - edlt.shox: "Caption".', article_text: 'No view label' });
  assert.deepEqual(result.views, { value: 35600, raw: '35.6K', approximate: true, source: 'profile_grid' });
  assert.equal(result.caption, 'Caption');
});

test('a retry preserves fields already collected', () => {
  const merged = mergeItem({ date: '2026-10-01T00:00:00.000Z', likes: { value: 7 }, status: 'partial' },
    { date: null, likes: null, comments: { value: 2 }, views: { value: 9 }, status: 'partial' });
  assert.equal(merged.status, 'complete');
  assert.equal(merged.likes.value, 7);
});

test('a date-only retry cannot replace an exact timestamp', () => {
  const merged = mergeItem({ date: '2026-10-23T02:00:00.000Z' }, { date: '2026-10-23', date_precision: 'day' });
  assert.equal(merged.date, '2026-10-23T02:00:00.000Z');
  assert.equal(merged.date_precision, 'timestamp');
});
