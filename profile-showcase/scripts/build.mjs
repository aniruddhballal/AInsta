import { access, copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'snapshot');
const output = join(root, 'dist');
const published = 'edlt.shox';
const readJson = async (name) => JSON.parse(await readFile(join(source, name), 'utf8'));
const plainText = (value) => String(value ?? '').replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0E\uFE0F\u200D\u20E3]/gu, '');
const esc = (value) => plainText(value).replace(/[&<>"']/g, (ch) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const fmt = (value) => Number.isFinite(value) ? new Intl.NumberFormat('en-IN').format(value) : 'Unavailable';
const instagram = (username) => `https://www.instagram.com/${encodeURIComponent(username)}/`;
const external = (url, label, className = '') => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['www.instagram.com', 'instagram.com'].includes(parsed.hostname)) {
    throw new Error(`Invalid Instagram URL: ${url}`);
  }
  return `<a class="${className}" href="${esc(parsed.href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
};
const metric = (value) => value?.raw || (Number.isFinite(value?.value) ? fmt(value.value) : 'Unavailable');
const date = (value, precision) => {
  if (!value) return 'Date unavailable';
  if (precision === 'day' || /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(parsed.valueOf()) ? value : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : `${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(parsed)} IST`;
};
const field = (label, value) => `<div class="fact"><dt>${esc(label)}</dt><dd>${esc(value ?? 'Unavailable')}</dd></div>`;
const localImage = async (file) => {
  try { await access(join(source, 'media', file)); return file; } catch { return null; }
};

const index = await readJson('index.json');
const profile = await readJson(`${published}/profile.json`);
const discovery = await readJson(`${published}/discovery.json`);
const items = await readJson(`${published}/items.json`);
const run = await readJson(`${published}/run.json`);
if (!Array.isArray(index.profile_keys) || !index.profile_keys.includes(published)) throw new Error('Published profile is missing from the catalog.');
if (!index.profile_keys.every((username) => /^[A-Za-z0-9._]{1,30}$/.test(username))) throw new Error('Catalog contains an invalid username.');
if (new Set(index.profile_keys).size !== index.profile_keys.length) throw new Error('Catalog contains duplicate usernames.');
if (profile.username !== published || !Array.isArray(items) || !discovery.reel?.complete) throw new Error('Published snapshot is incomplete.');
const reels = items.filter((item) => item.kind === 'reel');
if (reels.length !== discovery.reel.items.length) throw new Error('Published reel records do not match the confirmed grid.');
const complete = reels.filter((item) => item.status === 'complete' && !item.last_error).length;
const review = reels.length - complete;
const buildDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date());

function shell({ title, description, base, active, content }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#ffffff"><meta name="description" content="${esc(description)}"><title>${esc(title)}</title><link rel="stylesheet" href="${base}assets/site.css"><script src="${base}assets/site.js" defer></script></head><body>
  <a class="skip-link" href="#main">Skip to content</a><header class="topbar"><div class="topbar-inner"><a class="brand" href="${base}" aria-label="Dedgram Atlas home"><span class="brand-icon">D</span><span>DEDGRAM <small>ATLAS</small></span></a><nav aria-label="Main navigation"><a class="${active === 'catalog' ? 'active' : ''}" href="${base}">Profiles</a><a class="${active === 'profile' ? 'active' : ''}" href="${base}profiles/${published}/">Profile record</a></nav><span class="nav-status">COLLECTION IN PROGRESS</span></div></header>
  <main id="main">${content}</main><footer class="footer"><div><strong>DEDGRAM ATLAS</strong><p>Saved profile records.</p></div><div><span>Updated ${esc(buildDate)}</span><span>Metrics reflect the saved snapshot.</span></div></footer></body></html>`;
}

const catalogCards = index.profile_keys.map((username, i) => {
  const ready = username === published;
  const inner = `<span class="row-number">${String(i + 1).padStart(3, '0')}</span><span class="row-title"><strong>@${esc(username)}</strong><small>${esc(instagram(username))}</small></span><span class="row-tag ${ready ? 'live' : ''}">${ready ? 'Profile available' : 'In progress'}</span>`;
  return `<article class="profile-row" data-catalog-row><div class="profile-row-main">${ready ? `<a class="profile-internal" href="./profiles/${published}/" aria-label="View saved profile data for @${published}">${inner}</a>` : `<div class="profile-internal">${inner}</div>`}</div><div class="row-external">${external(instagram(username), 'Instagram', 'external-link')}</div></article>`;
}).join('');

const catalogHtml = shell({ title: 'Profiles · Dedgram Atlas', description: 'Explore the Dedgram profile catalog and the first published research profile.', base: './', active: 'catalog', content: `
  <section class="hero catalog-hero"><div class="hero-copy"><div class="eyebrow">PROFILE INDEX / PUBLIC PREVIEW</div><h1>Profiles,<br>on record.</h1><p>${fmt(index.profile_keys.length)} accounts indexed. The complete record for <a href="./profiles/${published}/">@${published}</a> is available; the rest are being collected.</p><div class="hero-actions"><a class="button primary" href="./profiles/${published}/">View profile record</a><a class="button secondary" href="#directory">Browse profiles</a></div></div><div class="hero-count" aria-label="One of ${fmt(index.profile_keys.length)} profiles published"><strong>01</strong><span>/ ${fmt(index.profile_keys.length)} PUBLISHED</span></div></section>
  <section class="stat-strip" aria-label="Publishing status"><div><span>CATALOG</span><strong>${fmt(index.profile_keys.length)}</strong><small>profile URLs indexed</small></div><div><span>PUBLISHED</span><strong>01</strong><small>full profile available</small></div><div><span>IN PROGRESS</span><strong>${fmt(index.profile_keys.length - 1)}</strong><small>more profiles to publish</small></div></section>
  <section class="process-note"><div><h2>Collection in progress</h2><p>More profile records will appear here as they are checked.</p></div></section>
  <section class="directory" id="directory"><div class="section-head"><div><span class="overline">01 / DIRECTORY</span><h2>Profile index</h2><p>Direct Instagram links for all ${fmt(index.profile_keys.length)} accounts.</p></div><div class="directory-search"><label for="catalog-search">Find a profile</label><input id="catalog-search" type="search" placeholder="Search @username" autocomplete="off"></div></div><div class="directory-toolbar"><span id="catalog-count">${fmt(index.profile_keys.length)} profiles shown</span><span>SAVED RECORDS APPEAR WHEN READY</span></div><div class="profile-list" id="profile-list">${catalogCards}</div><p class="empty-state" id="catalog-empty" hidden>No profiles match that search.</p></section>` });

const avatarFile = await localImage('avatar.jpg');
const avatar = avatarFile ? `<img src="../../media/avatar.jpg" alt="Profile picture of @${published}" width="92" height="92">` : `<span aria-hidden="true">@</span>`;
const displayName = plainText(profile.display_name).trim();
const profileIssues = (profile.issues || []).map((issue) => `<li>${esc(issue)}</li>`).join('');
const reelCards = await Promise.all(reels.map(async (item, index) => {
  const thumb = await localImage(`${item.shortcode}.jpg`);
  const dateLabel = date(item.date, item.date_precision);
  const missing = (item.missing || []).map((field) => `<li><strong>${esc(field)}:</strong> ${esc(item.missing_reasons?.[field] || 'No readable value was found.')}</li>`).join('');
  const hashtags = (item.hashtags || []).map((tag) => `#${tag}`).join(' ') || 'None captured';
  const mentions = (item.mentions || []).map((tag) => `@${tag}`).join(' ') || 'None captured';
  return `<article class="reel-card" data-reel-card data-status="${esc(item.status)}" data-date="${esc(item.date || '')}" data-views="${Number.isFinite(item.views?.value) ? item.views.value : -1}">
    <div class="reel-visual">${thumb ? `<img src="../../media/${esc(thumb)}" alt="Thumbnail for reel ${esc(item.shortcode)}" loading="lazy">` : `<span class="visual-placeholder">NO IMAGE</span>`}<span class="reel-index">${String(index + 1).padStart(2, '0')} / ${String(reels.length).padStart(2, '0')}</span><span class="reel-status ${item.status === 'complete' ? 'complete' : 'review'}">${item.status === 'complete' ? 'Complete' : 'Needs review'}</span></div>
    <div class="reel-content"><div class="reel-top"><span class="reel-date">${esc(dateLabel)}${item.date_precision === 'day' ? ' · date only' : ''}</span>${external(item.url, 'Open reel', 'reel-link')}</div><h3>${esc(item.shortcode)}</h3><p class="reel-caption">${esc(item.caption || 'No caption captured.')}</p>
    <div class="reel-metrics"><div><span>VIEWS</span><strong>${esc(metric(item.views))}</strong></div><div><span>LIKES</span><strong>${esc(metric(item.likes))}</strong></div><div><span>COMMENTS</span><strong>${esc(metric(item.comments))}</strong></div></div>
    ${missing ? `<div class="reel-warning"><strong>Manual review needed</strong><ul>${missing}</ul></div>` : ''}
    <details class="reel-details"><summary>Record details <span aria-hidden="true">+</span></summary><dl>${field('Reel URL', item.url)}${field('Published date precision', item.date_precision || 'Unavailable')}${field('Views source', item.views?.source)}${field('Views observed', item.views?.observed_at ? date(item.views.observed_at) : null)}${field('Grid views label', item.grid_views_raw)}${field('Likes source', item.likes?.source)}${field('Comments source', item.comments?.source)}${field('Fetched', item.fetched_at ? date(item.fetched_at) : null)}${field('Hashtags', hashtags)}${field('Mentions', mentions)}${field('Thumbnail URL', item.thumbnail_url)}${field('Media URL', item.media_url)}${field('Status', item.status)}</dl></details></div>
  </article>`;
}));

const profileHtml = shell({ title: `@${published} · Dedgram Atlas`, description: `Saved profile details and ${reels.length} reel records for @${published}.`, base: '../../', active: 'profile', content: `
  <section class="profile-hero"><div class="profile-hero-top"><a class="back-link" href="../../">All profiles</a><span class="snapshot-label">SAVED ${esc(date(profile.fetched_at))}</span></div><div class="profile-title-row"><div class="profile-avatar">${avatar}</div><div><div class="eyebrow">PROFILE RECORD / 001</div><h1>@${published}</h1>${displayName ? `<p>${esc(displayName)}</p>` : ''}</div><div class="profile-hero-link">${external(profile.url || instagram(published), 'Instagram profile', 'button secondary')}</div></div><div class="profile-meta"><span>${esc(profile.category || 'Category unavailable')}</span><span>${profile.ai_generated_profile ? 'AI-generated profile' : 'AI label not shown'}</span><span>Collected ${esc(date(profile.fetched_at))}</span></div></section>
  <section class="profile-stats" aria-label="Profile metrics"><div><span>FOLLOWERS</span><strong>${esc(metric(profile.followers_count))}</strong><small>Saved count</small></div><div><span>FOLLOWING</span><strong>${esc(metric(profile.following_count))}</strong><small>Profile header</small></div><div><span>POSTS</span><strong>${esc(metric(profile.posts_count))}</strong><small>Saved count</small></div><div><span>REELS</span><strong>${fmt(reels.length)}</strong><small>Full grid confirmed</small></div></section>
  <section class="profile-context"><div class="context-card"><span class="overline">02 / ACCOUNT DETAILS</span><h2>Account details</h2><dl class="account-facts">${field('Category', profile.category)}${field('Account based in', profile.account_based_in)}${field('Date joined', profile.date_joined)}${field('Former usernames', metric(profile.former_usernames_count))}${field('AI-generated label', profile.ai_generated_profile ? 'Shown on Instagram' : 'Not shown')}${field('Last profile scan', date(profile.fetched_at))}${field('Reel grid verified', date(discovery.reel.attempted_at))}${field('Collection run', `${run.status || 'Unknown'} · ${complete}/${reels.length} reels complete`)}</dl></div><div class="context-card bio-card"><span class="overline">PROFILE BIO</span><h2>Bio</h2><p class="bio-text">${esc(profile.bio || 'No bio captured.')}</p></div></section>
  ${profileIssues ? `<section class="evidence-note"><span class="note-symbol">i</span><div><h2>Source note</h2><ul>${profileIssues}</ul><p>These notes come from the saved collection record.</p></div></section>` : ''}
  <section class="reels-section" id="reels"><div class="section-head"><div><span class="overline">03 / REEL RECORDS</span><h2>${fmt(reels.length)} reels</h2><p>${fmt(complete)} complete · ${fmt(review)} need review · Metrics retain Instagram's displayed precision.</p></div><div class="reel-controls"><div class="control-field"><label for="reel-search">Search reels</label><input id="reel-search" type="search" placeholder="Shortcode or caption" autocomplete="off"></div><div class="control-field"><label for="reel-filter">Show</label><select id="reel-filter"><option value="all">All records</option><option value="complete">Complete</option><option value="review">Needs review</option></select></div><div class="control-field"><label for="reel-sort">Sort</label><select id="reel-sort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="views">Most views</option></select></div></div></div><div class="directory-toolbar"><span id="reel-count">${fmt(reels.length)} reels shown</span><span>SAVED SNAPSHOT</span></div><div class="reel-grid" id="reel-grid">${reelCards.join('')}</div><p class="empty-state" id="reel-empty" hidden>No reels match those filters.</p></section>
  <section class="downloads"><div><span class="overline">04 / SOURCE FILES</span><h2>Source files</h2><p>Original records and exports.</p></div><div class="download-links">${['profile.json', 'discovery.json', 'items.json', 'run.json', 'profile.csv', 'items.csv', 'report.html'].map((name) => `<a href="../../downloads/${published}/${name}" ${name.endsWith('.json') || name.endsWith('.csv') ? 'download' : ''}>${esc(name)}</a>`).join('')}</div></section>` });

await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'assets'), { recursive: true });
await mkdir(join(output, 'profiles', published), { recursive: true });
await mkdir(join(output, 'downloads', published), { recursive: true });
await mkdir(join(output, 'media'), { recursive: true });
await writeFile(join(output, 'index.html'), catalogHtml);
await writeFile(join(output, 'profiles', published, 'index.html'), profileHtml);
for (const file of ['site.css', 'site.js']) await copyFile(join(root, 'src', file), join(output, 'assets', file));
for (const file of ['profile.json', 'discovery.json', 'items.json', 'run.json', 'profile.csv', 'items.csv', 'report.html']) {
  await copyFile(join(source, published, file), join(output, 'downloads', published, file));
}
for (const file of await readdir(join(source, 'media'))) await copyFile(join(source, 'media', file), join(output, 'media', file));
console.log(`Built ${output}: ${index.profile_keys.length} profiles, ${reels.length} reels, ${complete} complete, ${review} for review.`);
