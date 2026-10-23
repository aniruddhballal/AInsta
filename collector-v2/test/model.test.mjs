import test from 'node:test';
import assert from 'node:assert/strict';
import { count, profileFromSnapshot, profileHeaderComplete, profileLevelComplete, canonicalItemUrl, itemFromSnapshot } from '../src/model.mjs';
import { mergeDiscoveryItems, mergeItem, mergeProfile, syncGridViews } from '../src/store.mjs';

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
  assert.equal(profileHeaderComplete(result), true);
  assert.equal(profileLevelComplete(result), false);
  assert.equal(profileLevelComplete(result, { post: { complete: true }, reel: { complete: true } }), true);
  assert.equal(profileLevelComplete(result, { post: { complete: true }, reel: { complete: false } }), false);
});

test('a profile with missing header counts needs review before a reels-only run', () => {
  const result = profileFromSnapshot('example', { header_text: 'example\n10 followers\n0 following' });
  assert.equal(profileHeaderComplete(result), false);
  assert.match(result.issues.join(' '), /Post count unavailable/);
});

test('profile reads post count from page metadata when the public header omits it', () => {
  const result = profileFromSnapshot('edlt.shox', { header_text: 'edlt.shox\n22.2K followers\n0 following',
    description: '20K Followers, 49 Following, 0 Posts - account on Instagram' });
  assert.equal(result.posts_count.value, 0);
  assert.equal(result.following_count.value, 0);
  assert.equal(result.following_count.source, 'header_text');
  assert.equal(result.count_evidence.following.header.value, 0);
  assert.equal(result.count_evidence.following.metadata.value, 49);
  assert.equal(mergeProfile({ date_joined: 'September 2026' }, result).date_joined, 'September 2026');
});

test('profile prefers the exact follower title over the rounded header', () => {
  const result = profileFromSnapshot('edlt.shox', { header_text: 'edlt.shox\n22.3K followers\n0 following',
    description: '20K Followers, 49 Following, 0 Posts',
    stat_evidence: { followers: { label: '22.3K followers', exact_title: '22,316' } } });
  assert.deepEqual(result.followers_count, { value: 22316, raw: '22,316', approximate: false, source: 'header_title' });
  assert.equal(result.count_evidence.following.conflict, true);
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

test('missing fields carry a specific reason when known and a source-level reason otherwise', () => {
  const result = itemFromSnapshot({ kind: 'reel', grid_views_issue: 'Sensitive Content overlay hides the profile grid view label.' }, {
    og_description: '12 likes, 3 comments - edlt.shox on October 22, 2026: "Caption"',
    article_text: 'Sensitive Content\nSee reel'
  });
  assert.equal(result.missing_reasons.views, 'Sensitive Content overlay hides the profile grid view label.');
  const generic = itemFromSnapshot({ kind: 'post' }, { article_text: 'No metrics shown' });
  assert.match(generic.missing_reasons.likes, /No readable like count/);
  assert.match(generic.missing_reasons.date, /No readable timestamp/);
  assert.match(generic.missing_reasons.views, /content page/);
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

test('a refreshed grid label replaces a stale rounded view count', () => {
  const result = syncGridViews({ grid_views_raw: '35.9K', views: { value: 35900, raw: '35.9K', source: 'profile_grid' },
    date: '2026-10-23', likes: { value: 1 }, comments: { value: 2 }, status: 'complete' },
  { grid_views_raw: '38.3K' }, '2026-10-23T09:00:00.000Z');
  assert.deepEqual(result.views, { value: 38300, raw: '38.3K', approximate: true,
    source: 'profile_grid', observed_at: '2026-10-23T09:00:00.000Z' });
  assert.equal(result.status, 'complete');
});

test('a completed grid refresh removes vanished items while an interrupted scan retains them', () => {
  const previous = [{ url: 'old', grid_views_raw: '1K' }, { url: 'kept', grid_views_raw: '2K' }];
  const found = [{ url: 'kept', grid_views_raw: '2.1K' }];
  assert.deepEqual(mergeDiscoveryItems(previous, found, false).map((item) => item.url), ['old', 'kept']);
  assert.deepEqual(mergeDiscoveryItems(previous, found, true), [{ url: 'kept', grid_views_raw: '2.1K' }]);
});
