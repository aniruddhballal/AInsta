import { badge, esc, metric, number, profileHref, statusText, time } from './shared.js';

export const steps = [
  { path: '/', label: 'Choose profiles', short: 'Select', number: '01' },
  { path: '/collect/profiles', label: 'Profile details', short: 'Profiles', number: '02', mode: 'profile_header', stage: 'profile_header', action: 'Collect profile details', description: 'Read each account header and About this account. Save the exact post count and the time it was observed.' },
  { path: '/collect/reel-urls', label: 'Reel URLs', short: 'Reel URLs', number: '03', mode: 'reel_grid', stage: 'reel_grid', action: 'Discover reel URLs', description: 'Scan each reel grid to the end. Save every reel URL, the final count, and when the scan finished.' },
  { path: '/collect/reel-details', label: 'Reel details', short: 'Details', number: '04', mode: 'reel_details', stage: 'reels', action: 'Collect reel details', description: 'Visit the saved reel URLs to collect dates, captions, views, likes, and comments.' },
  { path: '/collection/review', label: 'Review results', short: 'Review', number: '05' }
];

const selected = (state) => state.catalog.filter((profile) => state.selected.has(profile.username));
const date = (value) => value ? time(value) : 'Time not recorded';
const count = (value) => value == null ? '—' : number(value);
const running = (state) => state.batch?.status === 'running';

export function stepNav(index) {
  return `<nav class="step-nav" aria-label="Collection steps">${steps.map((step, i) => `<a href="${step.path}" class="${i === index ? 'active' : ''}" ${i === index ? 'aria-current="step"' : ''}><span>${step.number}</span>${step.short}</a>`).join('')}</nav>`;
}

function hero(index, title, description, countText = '') {
  return `<section class="flow-hero"><div><span class="eyebrow">DEDGRAM / COLLECTION ${steps[index].number}</span><h1>${title}</h1><p>${esc(description)}</p></div><strong>${esc(countText || steps[index].number)}</strong></section>`;
}

export function batchStrip(state) {
  const batch = state.batch;
  if (!batch) return '';
  const active = running(state);
  const done = batch.steps?.filter((step) => ['complete', 'needs_review', 'failed', 'skipped'].includes(batch.results?.[step.username]?.stages?.[step.stage]?.status)).length || 0;
  return `<section class="flow-batch ${active ? 'active' : ''}" aria-live="polite"><div><span class="eyebrow">${active ? 'COLLECTION RUNNING' : 'LATEST RUN'}</span><strong>${active ? `@${esc(batch.current || 'preparing')} · ${esc(batch.current_stage?.replaceAll('_', ' ') || 'preparing')}` : esc(statusText(batch.status))}</strong><small>${active ? `${number(done)} / ${number(batch.steps?.length || 0)} stages finished` : `${esc(batch.mode?.replaceAll('_', ' ') || 'collection')} · ${esc(date(batch.finished_at || batch.updated_at))}`}</small></div>${active && !state.readOnly ? `<button class="button secondary" data-action="stop" ${batch.stop_requested || state.busy ? 'disabled' : ''}>${batch.stop_requested ? 'Stopping after this stage' : 'Stop after this stage'}</button>` : ''}</section>`;
}

export function visibleCatalog(state) {
  const query = state.search.trim().toLowerCase();
  return state.catalog.filter((profile) => {
    if (query && ![profile.username, profile.display_name, profile.category, profile.country].some((value) => String(value || '').toLowerCase().includes(query))) return false;
    return state.filter === 'uncollected' ? !profile.profile_fetched_at : state.filter === 'collected' ? !!profile.profile_fetched_at : true;
  });
}

export function renderSelect(state) {
  const visible = visibleCatalog(state);
  return `${hero(0, 'Choose your<br>profiles.', 'Select the accounts to move through the collection steps. Your selection stays with you between pages.', String(state.selected.size).padStart(2, '0'))}
    ${stepNav(0)}${batchStrip(state)}
    <section class="flow-head"><div><span class="eyebrow">PROFILE DIRECTORY</span><h2>${number(state.catalog.length)} accounts</h2><p>${number(state.selected.size)} selected for this collection</p></div><div class="flow-actions"><button class="button secondary" data-action="select-visible">Select visible</button><button class="button secondary" data-action="clear">Clear</button><a class="button primary ${state.selected.size ? '' : 'disabled'}" href="/collect/profiles" ${state.selected.size ? '' : 'aria-disabled="true"'}>Continue to profiles →</a></div></section>
    <div class="flow-filters"><label>SEARCH PROFILES<input id="catalog-search" type="search" placeholder="Username, country, category" value="${esc(state.search)}"></label><label>SHOW<select id="catalog-filter"><option value="all" ${state.filter === 'all' ? 'selected' : ''}>All profiles</option><option value="uncollected" ${state.filter === 'uncollected' ? 'selected' : ''}>Not collected</option><option value="collected" ${state.filter === 'collected' ? 'selected' : ''}>Profile saved</option></select></label></div>
    <div class="flow-list-title"><span>${number(visible.length)} PROFILES SHOWN</span><span>SELECT TO INCLUDE</span></div>
    <div class="flow-profile-list">${visible.map((profile, index) => `<label class="flow-profile-row"><span class="index">${String(index + 1).padStart(2, '0')}</span>${profile.profile_picture_url ? `<img src="${esc(profile.profile_picture_url)}" alt="" loading="lazy">` : `<span class="fallback">${esc(profile.username[0].toUpperCase())}</span>`}<span class="identity"><strong>@${esc(profile.username)}</strong><small>${esc(profile.display_name || profile.category || profile.country || 'Instagram profile')}</small></span><span class="meta">${profile.profile_fetched_at ? 'PROFILE SAVED' : 'NOT COLLECTED'}</span><input type="checkbox" data-select="${esc(profile.username)}" ${state.selected.has(profile.username) ? 'checked' : ''} aria-label="Select ${esc(profile.username)}"></label>`).join('')}</div>${visible.length ? '' : '<p class="flow-empty">No profiles match this search.</p>'}`;
}

function stageInfo(profile, stage) {
  if (stage === 'profile_header') return { value: count(profile.posts_count), unit: 'EXACT POSTS', timestamp: profile.posts_count_observed_at, ready: profile.profile_header_complete && profile.posts_count !== null, issue: profile.posts_count_error };
  if (stage === 'reel_grid') return { value: count(profile.reels.discovered), unit: 'REEL URLS', timestamp: profile.reels.grid_complete ? profile.reels.attempted_at : null, ready: profile.reels.grid_complete, issue: profile.reels.grid_error };
  return { value: `${number(profile.reels.processed)} / ${count(profile.reels.discovered)}`, unit: 'REELS VISITED', timestamp: profile.run.updated_at, ready: profile.reels.grid_complete && profile.reels.processed >= profile.reels.discovered && profile.reels.review === 0, issue: profile.reels.review ? `${profile.reels.review} need review` : null };
}

export function renderStage(state, index) {
  const step = steps[index];
  const profiles = selected(state);
  const missing = step.stage === 'reel_grid' ? profiles.filter((p) => !p.profile_header_complete || p.posts_count === null)
    : step.stage === 'reels' ? profiles.filter((p) => !p.profile_complete) : [];
  const ready = profiles.length && !missing.length && !running(state) && !state.busy && !state.readOnly;
  const allDone = profiles.length && profiles.every((p) => stageInfo(p, step.stage).ready);
  return `${hero(index, `${step.label}<br><em>${index === 1 ? '& post count.' : index === 2 ? '& count.' : '& metrics.'}</em>`, step.description)}
    ${stepNav(index)}${batchStrip(state)}
    <section class="flow-head"><div><span class="eyebrow">STEP ${step.number} / ${number(profiles.length)} SELECTED</span><h2>${esc(step.label)}</h2><p>This screen saves only its own stage of collection.</p></div><div class="flow-actions"><a class="button secondary" href="${steps[index - 1].path}">← Back</a><button class="button primary" data-action="run-stage" data-mode="${step.mode}" ${ready ? '' : 'disabled'}>${running(state) && state.batch?.mode === step.mode ? 'Collecting…' : allDone ? `Run ${esc(step.label)} again` : step.action}</button></div></section>
    ${!profiles.length ? '<p class="flow-warning">Choose profiles on the first screen before starting a stage.</p>' : ''}
    ${missing.length ? `<p class="flow-warning">Finish the previous step for ${number(missing.length)} account${missing.length === 1 ? '' : 's'} first: ${missing.slice(0, 6).map((p) => `@${esc(p.username)}`).join(', ')}${missing.length > 6 ? '…' : ''}.</p>` : ''}
    <div class="scope-strip">${index === 1 ? '<div><span>PROFILE</span><strong>Name, bio, location, followers</strong></div><div><span>POSTS</span><strong>Exact header count</strong></div><div><span>TIME</span><strong>When observed</strong></div>' : index === 2 ? '<div><span>DISCOVERY</span><strong>Every reel URL</strong></div><div><span>COUNT</span><strong>Final saved URL count</strong></div><div><span>TIME</span><strong>When grid scan finished</strong></div>' : '<div><span>DETAILS</span><strong>Date, caption, hashtags</strong></div><div><span>METRICS</span><strong>Views, likes, comments</strong></div><div><span>REVIEW</span><strong>Missing or unreadable values</strong></div>'}</div>
    <div class="flow-table"><div class="flow-table-head"><span>ACCOUNT</span><span>${index === 1 ? 'POST COUNT' : index === 2 ? 'REEL URLS' : 'REEL DETAILS'}</span><span>OBSERVED</span><span>STATUS</span></div>${profiles.map((p, i) => {
      const info = stageInfo(p, step.stage);
      const runStatus = state.batch?.results?.[p.username]?.stages?.[step.stage]?.status;
      return `<div class="flow-table-row"><span class="account"><small>${String(i + 1).padStart(2, '0')}</small><a href="${profileHref(p.username)}">@${esc(p.username)}</a></span><span class="value"><strong>${esc(info.value)}</strong><small>${info.unit}</small></span><span class="when">${esc(date(info.timestamp))}</span><span>${badge(runStatus || (info.ready ? 'complete' : 'queued'))}${!info.ready && info.issue ? `<small class="issue">${esc(info.issue)}</small>` : ''}</span></div>`;
    }).join('')}</div>
    <div class="flow-next"><span>${allDone ? 'Saved results are ready for the next step.' : running(state) ? 'Collection is running. Results update here automatically.' : 'Return to this screen to retry or refresh its data.'}</span><a class="button ${allDone ? 'primary' : 'secondary'}" href="${steps[index + 1].path}">Next: ${esc(steps[index + 1].label)} →</a></div>`;
}

export function renderReview(state) {
  const profiles = selected(state);
  const total = profiles.reduce((sum, p) => sum + (p.reels.discovered || 0), 0);
  const processed = profiles.reduce((sum, p) => sum + p.reels.processed, 0);
  return `${hero(4, 'Review your<br>collection.', 'Check the saved counts and open an account to inspect its reel records.')}${stepNav(4)}${batchStrip(state)}
    <div class="flow-stats"><div><span>SELECTED PROFILES</span><strong>${number(profiles.length)}</strong></div><div><span>REEL URLS SAVED</span><strong>${number(total)}</strong></div><div><span>REELS VISITED</span><strong>${number(processed)}</strong></div></div>
    <section class="flow-head"><div><span class="eyebrow">RESULTS BY ACCOUNT</span><h2>Collection records</h2></div><div class="flow-actions"><a class="button secondary" href="/collect/reel-details">← Reel details</a><a class="button primary" href="/overview">Open overview →</a></div></section>
    <div class="flow-table"><div class="flow-table-head"><span>ACCOUNT</span><span>EXACT POSTS</span><span>REEL URLS</span><span>REELS VISITED</span></div>${profiles.map((p) => `<div class="flow-table-row"><span class="account"><a href="${profileHref(p.username)}">@${esc(p.username)} ↗</a></span><span class="value"><strong>${count(p.posts_count)}</strong><small>${esc(date(p.posts_count_observed_at))}</small></span><span class="value"><strong>${count(p.reels.discovered)}</strong><small>${esc(p.reels.grid_complete ? date(p.reels.attempted_at) : 'Not finalized')}</small></span><span class="value"><strong>${number(p.reels.processed)}</strong><small>${number(p.reels.review)} need review</small></span></div>`).join('')}</div>${profiles.length ? '' : '<p class="flow-empty">No profiles selected. <a href="/">Choose profiles</a> to review a collection.</p>'}`;
}
