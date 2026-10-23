import { compact, errorBanner, esc, gridLabel, metric, number, profileHref } from './shared.js';

function bars(rows, total) {
  return rows.length ? rows.slice(0, 8).map((row) => `<div class="bar-row"><div><span>${esc(row.name)}</span><strong>${number(row.count)}</strong></div><div class="bar-track"><span style="width:${Math.max(5, Math.round(row.count / Math.max(total, 1) * 100))}%"></span></div></div>`).join('')
    : '<p class="muted">No data yet.</p>';
}

export function renderOverview(state) {
  const s = state.overview;
  if (!s) return '<div class="loading">Loading overview…</div>';
  return `${errorBanner(state.error)}<section class="summary-hero"><span class="eyebrow">COLLECTION OVERVIEW</span><h1>The whole picture,<br><em>one reel at a time.</em></h1><p>These totals reflect profiles collected with this workspace. Rounded Instagram labels remain estimates.</p></section>
    <section class="stat-grid overview-stats"><div class="stat feature"><span>PROFILES COLLECTED</span><strong>${number(s.collected_profiles)}<small> / ${number(s.catalog_profiles)}</small></strong><small>${number(s.profiles_counted)} with exact post and reel counts</small></div>
      <div class="stat"><span>REELS FOUND</span><strong>${s.reels_discovered === null ? 'Error' : number(s.reels_discovered)}</strong><small>${number(s.reel_grids_complete)} / ${number(s.catalog_profiles)} grids complete</small></div>
      <div class="stat"><span>INSTAGRAM POSTS</span><strong>${s.instagram_posts_total === null ? 'Error' : number(s.instagram_posts_total)}</strong><small>${number(s.profiles.filter((p) => p.posts_count !== null).length)} / ${number(s.catalog_profiles)} exact header counts</small></div>
      <div class="stat"><span>REEL VIEWS</span><strong>${compact(s.engagement.views.total)}</strong><small>${s.engagement.views.approximate ? 'Estimated · ' : ''}${number(s.engagement.views.covered)} reels with views</small></div>
      <div class="stat"><span>REEL LIKES</span><strong>${compact(s.engagement.likes.total)}</strong><small>${s.engagement.likes.approximate ? 'Estimated · ' : ''}${number(s.engagement.likes.covered)} reels with likes</small></div></section>
    <section class="overview-grid"><div class="panel"><span class="eyebrow">PROFILE MAP</span><h2>Accounts by country</h2>${bars(s.countries, s.collected_profiles)}</div>
      <div class="panel"><span class="eyebrow">REEL LANGUAGE</span><h2>Frequent hashtags</h2>${bars(s.hashtags, s.reels_processed)}<p class="panel-foot">From collected reel captions.</p></div></section>
    <section class="overview-table"><div class="section-heading"><div><span class="eyebrow">ACROSS ACCOUNTS</span><h2>Profile performance</h2><p>View and like totals include only reels with readable values.</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>PROFILE</th><th>INSTAGRAM POSTS</th><th>REEL GRID</th><th>REELS SCANNED</th><th>VIEWS EST.</th><th>LIKES EST.</th><th>FOLLOWERS</th></tr></thead><tbody>${s.profiles.map((p) => `<tr><td><a href="${profileHref(p.username)}">@${esc(p.username)} ↗</a><small class="cell-note">${esc(p.country || 'Location unavailable')}</small></td><td title="${esc(p.posts_count_error || '')}">${p.posts_count === null ? 'Error' : number(p.posts_count)}</td><td title="${esc(p.reels.grid_error || '')}">${gridLabel(p.reels)}</td><td>${p.reels.processed} / ${gridLabel(p.reels)}</td><td><strong>${compact(p.total_views_estimate)}</strong><small class="cell-note">${p.views_covered} reels measured</small></td><td>${compact(p.total_likes_estimate)}</td><td>${esc(metric(p.followers))}</td></tr>`).join('')}</tbody></table></div>
      ${!s.profiles.length ? '<div class="empty-state"><strong>No profiles collected yet.</strong><p><a href="/">Choose profiles to begin.</a></p></div>' : ''}</section>
    <section class="overview-table"><div class="section-heading"><div><span class="eyebrow">ALL COLLECTED REELS</span><h2>Most viewed reels</h2><p>Sorted by the numeric estimate of Instagram's displayed view label.</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>REEL</th><th>PROFILE</th><th>DATE</th><th>VIEWS</th><th>LIKES</th><th>COMMENTS</th></tr></thead><tbody>${s.top_reels.map((item) => `<tr><td><div class="content-cell">${item.thumbnail_url ? `<img src="${esc(item.thumbnail_url)}" alt="" loading="lazy">` : '<div class="thumb-fallback">▦</div>'}<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.shortcode)} ↗</a></div></td><td><a href="${profileHref(item.username)}">@${esc(item.username)}</a></td><td>${esc(item.date || '—')}</td><td><strong>${esc(metric(item.views))}</strong></td><td>${esc(metric(item.likes))}</td><td>${esc(metric(item.comments))}</td></tr>`).join('')}</tbody></table></div></section>
    <p class="method-note">Totals are snapshots, not a time series. Instagram's K/M labels are rounded; missing metrics are excluded.</p>`;
}
