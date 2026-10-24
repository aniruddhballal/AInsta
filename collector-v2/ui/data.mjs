import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths, readJson } from '../src/store.mjs';
import { exactPostCount, gridCount, gridCountError, postCountError, profileHeaderComplete, profileLevelComplete } from '../src/model.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = resolve(root, '..', 'bot-info', 'database', 'profiles', 'index.json');

export async function usernames() {
  const index = await readJson(catalogPath);
  if (!Array.isArray(index?.profile_keys)) throw new Error('Profile catalog is unavailable.');
  return [...new Set(index.profile_keys.filter((name) => /^[A-Za-z0-9._]{1,30}$/.test(name)))];
}

export async function resolveUsername(requested) {
  if (typeof requested !== 'string') return null;
  return (await usernames()).find((name) => name.toLowerCase() === requested.toLowerCase()) || null;
}

export async function profileData(username) {
  const path = paths(root, username);
  const [profile, discovery, items, run] = await Promise.all([
    readJson(path.profile), readJson(path.discovery, {}), readJson(path.items, []), readJson(path.run, {})
  ]);
  return { username, profile, discovery, items, run };
}

export function profileSummary(data) {
  const { username, profile, discovery, items, run } = data;
  const content = (kind) => {
    const records = items.filter((item) => item.kind === kind);
    return {
      discovered: gridCount(discovery[kind]),
      processed: records.filter((item) => !!item.fetched_at).length,
      complete: records.filter((item) => item.status === 'complete' && !item.last_error).length,
      review: records.filter((item) => item.status === 'partial' || item.status === 'failed' || !!item.last_error).length,
      grid_complete: gridCount(discovery[kind]) !== null,
      attempted_at: discovery[kind]?.attempted_at || null,
      grid_error: gridCountError(discovery[kind])
    };
  };
  return {
    username,
    url: profile?.url || `https://www.instagram.com/${username}/`,
    display_name: profile?.display_name || null,
    profile_picture_url: profile?.profile_picture_url || null,
    category: profile?.category || null,
    bio: profile?.bio || null,
    country: profile?.account_based_in || null,
    date_joined: profile?.date_joined || null,
    followers: profile?.followers_count || null,
    following: profile?.following_count || null,
    posts_reported: profile?.posts_count || null,
    posts_count: exactPostCount(profile),
    posts_count_observed_at: profile?.posts_count_observed_at || null,
    posts_count_error: postCountError(profile),
    profile_fetched_at: profile?.fetched_at || null,
    profile_header_complete: profileHeaderComplete(profile),
    profile_complete: profileLevelComplete(profile, discovery),
    reels: content('reel'),
    posts: content('post'),
    run: { status: run.status || 'not_started', phase: run.phase || null,
      scope: run.scope || [], current_url: run.current_url || null,
      updated_at: run.updated_at || null, error: run.error || null }
  };
}

export async function catalog() {
  const keys = await usernames();
  return Promise.all(keys.map(async (username) => profileSummary(await profileData(username))));
}

export async function detail(username) {
  const data = await profileData(username);
  return { ...data, summary: profileSummary(data),
    items: data.items.map(({ raw, ...item }) => item) };
}

export async function summary() {
  const keys = await usernames();
  const data = await Promise.all(keys.map(profileData));
  const profiles = data.map(profileSummary);
  const reels = data.flatMap(({ username, items }) => items.filter((item) => item.kind === 'reel')
    .map((item) => ({ username, shortcode: item.shortcode, url: item.url,
      date: item.date, date_precision: item.date_precision,
      likes: item.likes, comments: item.comments, views: item.views,
      status: item.status, thumbnail_url: item.thumbnail_url,
      hashtags: item.hashtags || [] })));
  const measured = (field) => reels.filter((item) => Number.isFinite(item[field]?.value));
  const total = (field) => measured(field).reduce((sum, item) => sum + item[field].value, 0);
  const views = measured('views').map((item) => item.views.value).sort((a, b) => a - b);
  const countryCounts = new Map();
  const hashtagCounts = new Map();
  for (const profile of profiles) if (profile.country) countryCounts.set(profile.country, (countryCounts.get(profile.country) || 0) + 1);
  for (const reel of reels) for (const hashtag of reel.hashtags) hashtagCounts.set(hashtag, (hashtagCounts.get(hashtag) || 0) + 1);
  const ranked = (map) => [...map].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return {
    catalog_profiles: profiles.length,
    collected_profiles: profiles.filter((profile) => !!profile.profile_fetched_at).length,
    profiles_counted: profiles.filter((profile) => profile.profile_complete).length,
    reels_discovered: profiles.every((profile) => profile.reels.grid_complete)
      ? profiles.reduce((sum, profile) => sum + profile.reels.discovered, 0) : null,
    reel_grids_complete: profiles.filter((profile) => profile.reels.grid_complete).length,
    reels_processed: reels.filter((reel) => reel.status === 'complete' || reel.status === 'partial').length,
    reels_complete: reels.filter((reel) => reel.status === 'complete').length,
    reels_review: reels.filter((reel) => reel.status === 'partial' || reel.status === 'failed').length,
    instagram_posts_total: profiles.every((profile) => profile.posts_count !== null)
      ? profiles.reduce((sum, profile) => sum + profile.posts_count, 0) : null,
    post_grids_complete: profiles.filter((profile) => profile.posts.grid_complete).length,
    engagement: {
      views: { total: total('views'), covered: measured('views').length,
        approximate: measured('views').some((item) => item.views.approximate),
        median: views.length ? (views[Math.floor((views.length - 1) / 2)] + views[Math.floor(views.length / 2)]) / 2 : null },
      likes: { total: total('likes'), covered: measured('likes').length,
        approximate: measured('likes').some((item) => item.likes.approximate) },
      comments: { total: total('comments'), covered: measured('comments').length,
        approximate: measured('comments').some((item) => item.comments.approximate) }
    },
    countries: ranked(countryCounts),
    hashtags: ranked(hashtagCounts).slice(0, 20),
    top_reels: [...reels].filter((item) => item.views).sort((a, b) => b.views.value - a.views.value).slice(0, 20),
    profiles: profiles.filter((profile) => profile.profile_fetched_at).map((profile) => {
      const accountReels = reels.filter((reel) => reel.username === profile.username);
      return { ...profile, total_views_estimate: accountReels.reduce((sum, reel) => sum + (reel.views?.value || 0), 0),
        total_likes_estimate: accountReels.reduce((sum, reel) => sum + (reel.likes?.value || 0), 0),
        views_covered: accountReels.filter((reel) => !!reel.views).length };
    }).sort((a, b) => b.total_views_estimate - a.total_views_estimate)
  };
}
