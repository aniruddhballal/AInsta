import { badge, errorBanner, esc, number, profileHref, progress, statusText, time } from './shared.js';

export function filteredCatalog(state) {
  const needle = state.search.trim().toLowerCase();
  return state.catalog.filter((profile) => {
    if (needle && ![profile.username, profile.display_name, profile.country, profile.category, profile.bio]
      .some((value) => String(value || '').toLowerCase().includes(needle))) return false;
    if (state.filter === 'uncollected') return !profile.profile_fetched_at;
    if (state.filter === 'collected') return !!profile.profile_fetched_at;
    if (state.filter === 'review') return profile.reels.review > 0 || profile.run.status === 'blocked';
    return true;
  });
}

function card(profile, selected) {
  return `<article class="profile-card ${selected ? 'selected' : ''}">
    <div class="card-top"><label class="check-label"><input type="checkbox" data-select="${esc(profile.username)}" ${selected ? 'checked' : ''} aria-label="Select ${esc(profile.username)}"><span></span></label>${badge(profile.run.status)}</div>
    <div class="card-identity">${profile.profile_picture_url ? `<img class="avatar" src="${esc(profile.profile_picture_url)}" alt="" loading="lazy">` : `<div class="avatar fallback">${esc(profile.username[0].toUpperCase())}</div>`}
      <div><a class="profile-name" href="${profileHref(profile.username)}">@${esc(profile.username)} <span aria-hidden="true">↗</span></a><p>${esc(profile.display_name || profile.category || profile.country || 'Profile ready for collection')}</p></div></div>
    <div class="card-counts"><div><strong>${profile.profile_fetched_at ? `${profile.reels.processed}<small> / ${profile.reels.discovered}</small>` : '—'}</strong><span>REELS SCANNED</span></div><div><strong>${profile.reels.review || '—'}</strong><span>NEEDS REVIEW</span></div></div>
    ${progress(profile.reels.processed, profile.reels.discovered)}
    <div class="card-footer"><span>${profile.profile_fetched_at ? `Updated ${esc(time(profile.run.updated_at || profile.profile_fetched_at))}` : 'Ready to collect'}</span><a href="${profileHref(profile.username)}">View profile →</a></div>
  </article>`;
}

function batchPanel(state) {
  const batch = state.batch;
  if (!batch) return `<section class="batch-card empty-batch"><div><span class="eyebrow">RUN STATUS</span><h2>Ready when you are.</h2><p>Select profiles below, then start collection. Progress appears here as each profile finishes.</p></div><div class="empty-batch-art">◎</div></section>`;
  const finished = batch.profiles.filter((name) => ['complete', 'needs_review', 'failed'].includes(batch.results[name]?.status)).length;
  const complete = batch.profiles.filter((name) => batch.results[name]?.status === 'complete').length;
  const current = state.batchProfiles.find((profile) => profile.username === batch.current);
  const active = batch.status === 'running';
  return `<section class="batch-card">
    <div class="batch-heading"><div><span class="eyebrow">${active ? 'COLLECTION IN PROGRESS' : 'LATEST COLLECTION RUN'}</span><h2>${active ? `Scanning @${esc(batch.current || 'next profile')}` : esc(statusText(batch.status))}</h2>
      <p>${active ? `${esc(current?.run?.phase || 'Preparing collection')}${current?.run?.current_url ? ` · ${esc(current.run.current_url.split('/').filter(Boolean).at(-1))}` : ''}` : `Started ${esc(time(batch.started_at))}`}</p></div>
      ${active ? `<button class="button outline small" data-action="stop" ${batch.stop_requested ? 'disabled' : ''}>${batch.stop_requested ? 'Stopping after this profile' : 'Stop after current profile'}</button>` : ''}</div>
    <div class="batch-counts"><div><strong>${finished}<span> / ${batch.profiles.length}</span></strong><small>PROFILES FINISHED</small></div><div><strong>${complete}</strong><small>FULLY COMPLETE</small></div><div><strong>${batch.profiles.length - finished}</strong><small>REMAINING</small></div></div>
    ${progress(finished, batch.profiles.length)}
    ${current ? `<div class="current-breakdown"><span>@${esc(current.username)}</span><span>Reels: <b>${current.reels.processed} / ${current.reels.discovered || 'discovering'}</b> · ${current.reels.complete} complete</span><span>Posts: ${current.posts.processed} scanned · later</span></div>` : ''}
    <div class="batch-list">${batch.profiles.map((name) => {
      const profile = state.batchProfiles.find((item) => item.username === name);
      return `<div class="batch-row"><a href="${profileHref(name)}">@${esc(name)}</a>${badge(batch.results[name]?.status)}<span>${profile ? `${profile.reels.processed}/${profile.reels.discovered} reels · ${profile.posts.processed}/${profile.posts.discovered} posts` : 'Waiting'}</span></div>`;
    }).join('')}</div>
    ${batch.logs?.length ? `<details class="run-log"><summary>Recent activity</summary><pre>${esc(batch.logs.slice(-18).join('\n'))}</pre></details>` : ''}
  </section>`;
}

export function renderQueue(state) {
  const visible = filteredCatalog(state);
  const scanned = state.catalog.filter((profile) => !!profile.profile_fetched_at).length;
  const running = state.batch?.status === 'running';
  return `${errorBanner(state.error)}<section class="hero"><div><span class="eyebrow"><span class="mini-dot"></span> PROFILE RESEARCH / V2</span>
    <h1>Choose your profiles.<br><em>Follow every reel.</em></h1><p>Run a focused scan, watch each account progress, and open the results when they are ready.</p>
    <div class="hero-stats"><span><b>${number(state.catalog.length)}</b> in catalog</span><span><b>${number(scanned)}</b> collected</span><span><b>${number(state.selected.size)}</b> selected</span></div></div>
    <div class="hero-orbit"><div class="orbit-center">V2<span>REELS FIRST</span></div><i class="orb one"></i><i class="orb two"></i><i class="orb three"></i></div></section>
    ${batchPanel(state)}
    <section class="catalog-section"><div class="section-heading"><div><span class="eyebrow">PROFILE CATALOG</span><h2>Pick a collection set</h2><p>Accounts come from the existing bot profile index.</p></div>
      <div class="selection-actions"><button class="button subtle" data-action="select-visible">Select visible</button><button class="button subtle" data-action="clear">Clear</button>
        <button class="button primary" data-action="start" ${!state.selected.size || running || state.busy ? 'disabled' : ''}>${state.busy ? 'Starting…' : `Start ${state.selected.size ? `${state.selected.size} selected` : 'collection'}`} <span>→</span></button></div></div>
      <div class="toolbar"><div class="search-wrap"><span aria-hidden="true">⌕</span><input id="catalog-search" type="search" placeholder="Search username, country, category…" value="${esc(state.search)}" aria-label="Search profiles"></div>
        <select id="catalog-filter" aria-label="Filter profiles"><option value="all" ${state.filter === 'all' ? 'selected' : ''}>All profiles</option><option value="uncollected" ${state.filter === 'uncollected' ? 'selected' : ''}>Not collected</option><option value="collected" ${state.filter === 'collected' ? 'selected' : ''}>Collected</option><option value="review" ${state.filter === 'review' ? 'selected' : ''}>Needs review</option></select>
        <div class="layout-toggle"><button data-action="grid" class="${state.layout === 'grid' ? 'current' : ''}" aria-label="Grid view">▦</button><button data-action="list" class="${state.layout === 'list' ? 'current' : ''}" aria-label="List view">☰</button></div></div>
      <div class="catalog-meta">Showing ${number(visible.length)} of ${number(state.catalog.length)} profiles</div>
      ${visible.length ? `<div class="profile-grid ${state.layout === 'list' ? 'list-layout' : ''}">${visible.map((profile) => card(profile, state.selected.has(profile.username))).join('')}</div>` : `<div class="empty-state"><strong>No profiles match that view.</strong><p>Try another search or filter.</p></div>`}</section>`;
}
