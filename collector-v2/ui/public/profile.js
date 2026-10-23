import { badge, errorBanner, esc, gridLabel, metric, number, profileHref, reportHref, time } from './shared.js';

function reviewReason(item) {
  const parts = (item.missing || []).map((field) => `${field}: ${item.missing_reasons?.[field] || 'No readable value found.'}`);
  if (item.last_error) parts.push(`Retry: ${item.last_error}`);
  return parts.join(' · ');
}

function filteredItems(state) {
  const needle = state.itemSearch.trim().toLowerCase();
  const items = state.detail.items.filter((item) => {
    if (state.itemFilter === 'review' && !reviewReason(item)) return false;
    if (state.itemFilter === 'reels' && item.kind !== 'reel') return false;
    if (state.itemFilter === 'posts' && item.kind !== 'post') return false;
    return !needle || [item.shortcode, item.caption, item.url].some((value) => String(value || '').toLowerCase().includes(needle));
  });
  if (state.itemSort === 'views') items.sort((a, b) => (b.views?.value ?? -1) - (a.views?.value ?? -1));
  else if (state.itemSort === 'likes') items.sort((a, b) => (b.likes?.value ?? -1) - (a.likes?.value ?? -1));
  else if (state.itemSort === 'oldest') items.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  else items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return items;
}

export function renderProfile(state) {
  const data = state.detail;
  if (!data) return '<div class="empty-state"><h1>Profile unavailable</h1><p>This account is not in the catalog.</p><a href="/">Back to collection</a></div>';
  const p = data.summary;
  const review = data.items.filter((item) => !!reviewReason(item));
  const rows = filteredItems(state);
  const batchResult = state.batch?.results?.[p.username];
  const reportStatus = p.profile_header_complete && !p.profile_complete && p.run.status === 'complete'
    ? 'counts_pending' : batchResult?.status || p.run.status;
  return `${errorBanner(state.error)}<div class="breadcrumbs"><a href="/">Collection</a><span>/</span><span>@${esc(p.username)}</span></div>
    <section class="detail-hero"><div class="detail-identity">${p.profile_picture_url ? `<img class="detail-avatar" src="${esc(p.profile_picture_url)}" alt="">` : `<div class="detail-avatar fallback">${esc(p.username[0].toUpperCase())}</div>`}
      <div><span class="eyebrow">PROFILE REPORT</span><h1>@${esc(p.username)}</h1><p>${esc(p.display_name || p.category || 'Instagram profile')}</p>
        <div class="detail-links">${badge(reportStatus)}<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Instagram ↗</a><a href="${reportHref(p.username)}" target="_blank" rel="noopener noreferrer">HTML report ↗</a></div></div></div>
      <div class="detail-note"><span>LAST SCAN</span><strong>${esc(time(p.run.updated_at || p.profile_fetched_at))}</strong><small>${esc(p.run.phase || 'Awaiting first run')}</small></div></section>
    <section class="stat-grid detail-stats"><div class="stat"><span>FOLLOWERS</span><strong>${esc(metric(p.followers))}</strong><small>${p.followers?.approximate ? 'Displayed estimate' : 'Exact when available'}</small></div>
      <div class="stat"><span>FOLLOWING</span><strong>${esc(metric(p.following))}</strong><small>Visible profile header</small></div>
      <div class="stat"><span>REELS IN GRID</span><strong>${gridLabel(p.reels)}</strong><small>${p.reels.grid_complete ? `${p.reels.processed} item details scanned · ${p.reels.review} review` : esc(p.reels.grid_error)}</small></div>
      <div class="stat"><span>INSTAGRAM POSTS</span><strong>${p.posts_count === null ? 'Error' : number(p.posts_count)}</strong><small>${p.posts_count_error ? esc(p.posts_count_error) : 'Exact profile header count'}</small></div></section>
    <div class="detail-columns"><section class="panel"><span class="eyebrow">ACCOUNT DETAILS</span><h2>About this profile</h2><dl class="details-list">
      <div><dt>Category</dt><dd>${esc(p.category || '—')}</dd></div><div><dt>Based in</dt><dd>${esc(p.country || '—')}</dd></div><div><dt>Joined</dt><dd>${esc(p.date_joined || '—')}</dd></div>
      <div><dt>Former usernames</dt><dd>${esc(data.profile?.former_usernames_count?.raw ?? '—')}</dd></div><div><dt>AI label</dt><dd>${data.profile?.ai_generated_profile ? 'Shown' : 'Not shown'}</dd></div></dl></section>
      <section class="panel"><span class="eyebrow">PROFILE BIO</span><h2>What the account says</h2><p class="bio">${esc(p.bio || 'No bio available.')}</p></section></div>
    ${p.run.error ? `<section class="notice danger"><strong>Collection issue</strong><p>${esc(p.run.error)}</p></section>` : ''}
    ${p.profile_header_complete && !p.profile_complete ? `<section class="notice soft"><strong>Profile counts unavailable</strong><p>Rerun Profile details only to retry the reel count or an unreadable post count.</p><ul>${p.posts_count_error ? `<li>Instagram posts: ${esc(p.posts_count_error)}</li>` : ''}${!p.reels.grid_complete ? `<li>Reels: ${esc(p.reels.grid_error)}</li>` : ''}</ul></section>` : ''}
    ${review.length ? `<section class="notice"><div><span class="eyebrow">MANUAL REVIEW</span><h2>${review.length} item${review.length === 1 ? '' : 's'} need attention</h2></div><ul>${review.map((item) => `<li><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.shortcode)} ↗</a><span>${esc(reviewReason(item))}</span></li>`).join('')}</ul></section>` : ''}
    ${data.profile?.issues?.length ? `<section class="notice soft"><strong>Profile source notes</strong><ul>${data.profile.issues.map((issue) => `<li>${esc(issue)}</li>`).join('')}</ul></section>` : ''}
    <section class="items-section"><div class="section-heading"><div><span class="eyebrow">CONTENT INVENTORY</span><h2>Reels and posts</h2><p>${number(data.items.length)} saved records · click an ID to open Instagram.</p></div></div>
      <div class="toolbar"><div class="search-wrap"><span aria-hidden="true">⌕</span><input id="item-search" type="search" placeholder="Search ID or caption…" value="${esc(state.itemSearch)}" aria-label="Search content"></div>
        <select id="item-filter" aria-label="Filter content"><option value="all" ${state.itemFilter === 'all' ? 'selected' : ''}>All content</option><option value="reels" ${state.itemFilter === 'reels' ? 'selected' : ''}>Reels</option><option value="posts" ${state.itemFilter === 'posts' ? 'selected' : ''}>Posts</option><option value="review" ${state.itemFilter === 'review' ? 'selected' : ''}>Needs review</option></select>
        <select id="item-sort" aria-label="Sort content"><option value="newest" ${state.itemSort === 'newest' ? 'selected' : ''}>Newest first</option><option value="oldest" ${state.itemSort === 'oldest' ? 'selected' : ''}>Oldest first</option><option value="views" ${state.itemSort === 'views' ? 'selected' : ''}>Most views</option><option value="likes" ${state.itemSort === 'likes' ? 'selected' : ''}>Most likes</option></select></div>
      <div class="table-wrap"><table><thead><tr><th>CONTENT</th><th>DATE</th><th>LIKES</th><th>COMMENTS</th><th>VIEWS</th><th>STATUS</th><th>CAPTION</th></tr></thead><tbody>
      ${rows.map((item) => `<tr class="${reviewReason(item) ? 'row-review' : ''}"><td><div class="content-cell">${item.thumbnail_url ? `<img src="${esc(item.thumbnail_url)}" alt="" loading="lazy">` : '<div class="thumb-fallback">▦</div>'}<span><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.shortcode)} ↗</a><small>${esc(item.kind)}</small></span></div></td>
        <td>${esc(item.date || '—')}${item.date_precision === 'day' ? '<small class="cell-note">Day only</small>' : ''}</td><td>${esc(metric(item.likes))}</td><td>${esc(metric(item.comments))}</td><td><strong>${esc(metric(item.views))}</strong></td><td>${badge(item.status)}${reviewReason(item) ? `<small class="cell-note review-note">${esc(reviewReason(item))}</small>` : ''}</td><td class="caption" title="${esc(item.caption || '')}">${esc((item.caption || '—').slice(0, 120))}</td></tr>`).join('')}
      </tbody></table></div>${!rows.length ? '<div class="empty-state"><strong>No content matches this filter.</strong></div>' : ''}</section>`;
}
