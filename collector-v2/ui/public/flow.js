import { badge, esc, gridLabel, number, profileHref, progress, statusText, time } from './shared.js';
import { filteredCatalog, reelsNeedWork } from './queue.js';

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
  return `<section class="flow-hero"><div><span class="eyebrow"><span class="brand-word">deadgram</span> / COLLECTION ${steps[index].number}</span><h1>${title}</h1><p>${esc(description)}</p></div><strong>${esc(countText || steps[index].number)}</strong></section>`;
}

export function batchStrip(state) {
  const batch = state.batch;
  if (!batch) return '';
  const active = running(state);
  const done = batch.steps?.filter((step) => ['complete', 'needs_review', 'failed', 'skipped'].includes(batch.results?.[step.username]?.stages?.[step.stage]?.status)).length || 0;
  return `<section class="flow-batch ${active ? 'active' : ''}" aria-live="polite"><div><span class="eyebrow">${active ? 'COLLECTION RUNNING' : 'LATEST RUN'}</span><strong>${active ? `@${esc(batch.current || 'preparing')} · ${esc(batch.current_stage?.replaceAll('_', ' ') || 'preparing')}` : esc(statusText(batch.status))}</strong><small>${active ? `${number(done)} / ${number(batch.steps?.length || 0)} stages finished` : `${esc(batch.mode?.replaceAll('_', ' ') || 'collection')} · ${esc(date(batch.finished_at || batch.updated_at))}`}</small></div>${active && !state.readOnly ? `<button class="button secondary" data-action="stop" ${batch.stop_requested || state.busy ? 'disabled' : ''}>${batch.stop_requested ? 'Stopping after this stage' : 'Stop after this stage'}</button>` : ''}</section>`;
}

export function visibleCatalog(state) {
  return filteredCatalog(state);
}

const modeOptions = [
  ['profile_only', 'Profile details only', 'Collect account fields, the exact Instagram post count, and count the reel grid. Item details wait.'],
  ['depth_first', 'Profile + reels, depth first', 'Finish each account before moving to the next.'],
  ['breadth_first', 'Profile + reels, breadth first', "Collect every profile first, then every account's reels."],
  ['reels_only', 'Reels only', 'Use saved profile details; collect and retry reels.']
];

function strategy(state) {
  const unavailable = selected(state).filter((profile) => !profile.profile_complete);
  return `<section class="strategy-section"><p class="strategy-intro"><span class="eyebrow">COLLECTION STRATEGY</span>Each stage saves its result, so you can run reels later.</p>
    <div class="strategy-options">${modeOptions.map(([mode, title, description]) => `<label class="strategy-option ${state.mode === mode ? 'chosen' : ''}"><input type="radio" name="run-mode" value="${mode}" ${state.mode === mode ? 'checked' : ''}><span><strong>${esc(title)}</strong><small>${esc(description)}</small></span></label>`).join('')}</div>
    ${state.mode === 'reels_only' && unavailable.length ? `<p class="flow-warning">Finish profile details and reel counts first for ${unavailable.length} selected account${unavailable.length === 1 ? '' : 's'}.</p>` : ''}
  </section>`;
}

function orderControl(state) {
  return `<label class="flow-order">Run order <select id="run-order" aria-label="Profile run order"><option value="posts_ascending" ${state.order === 'posts_ascending' ? 'selected' : ''}>Fewest posts first</option><option value="reels_ascending" ${state.order === 'reels_ascending' ? 'selected' : ''}>Fewest reels first</option><option value="selection" ${state.order === 'selection' ? 'selected' : ''}>Selection order</option></select></label>`;
}

function runPanel(state) {
  const batch = state.batch;
  if (!batch) return `<section class="run-panel"><span class="eyebrow">RUN STATUS</span><h2>Ready when you are.</h2><p>Select profiles below, then start collection. Progress appears here as each stage finishes.</p></section>`;
  const steps = batch.steps || batch.profiles.map((username) => ({ username, stage: 'reels' }));
  const done = (step) => ['complete', 'needs_review', 'failed', 'skipped'].includes(batch.results?.[step.username]?.stages?.[step.stage]?.status || batch.results?.[step.username]?.status);
  const finished = batch.profiles.filter((name) => batch.results?.[name]?.stages
    ? Object.values(batch.results[name].stages).every((stage) => ['complete', 'needs_review', 'failed', 'skipped'].includes(stage.status))
    : ['complete', 'needs_review', 'failed', 'skipped'].includes(batch.results?.[name]?.status)).length;
  const complete = batch.profiles.filter((name) => batch.results?.[name]?.status === 'complete'
    && (batch.mode !== 'profile_only' || state.batchProfiles.find((profile) => profile.username === name)?.profile_complete)).length;
  const profileSteps = steps.filter((step) => ['profile', 'profile_header'].includes(step.stage));
  const reelSteps = steps.filter((step) => ['reel_grid', 'reels'].includes(step.stage));
  const current = state.batchProfiles.find((profile) => profile.username === batch.current);
  const active = running(state);
  return `<section class="run-panel"><div class="run-panel-top"><div><span class="eyebrow">${active ? 'COLLECTION IN PROGRESS' : 'LATEST COLLECTION RUN'} / ${esc(batch.mode?.replaceAll('_', ' ') || 'collection')}</span>
    <h2>${active ? `@${esc(batch.current || 'Preparing next stage')}` : esc(statusText(batch.status))}</h2><p>${active ? `${esc(current?.run?.phase || batch.current_stage || 'Preparing collection')}${current?.run?.current_url ? ` / ${esc(current.run.current_url.split('/').filter(Boolean).at(-1))}` : ''}` : `Started ${esc(date(batch.started_at))}`}</p></div>
    ${active && !state.readOnly ? `<button class="button secondary" data-action="stop" ${batch.stop_requested || state.busy ? 'disabled' : ''}>${batch.stop_requested ? 'Stopping after this stage' : 'Stop after current stage'}</button>` : ''}</div>
    <div class="run-counts"><div><strong>${finished}<small> / ${batch.profiles.length}</small></strong><span>PROFILES FINISHED</span></div><div><strong>${complete}</strong><span>FULLY COMPLETE</span></div>${profileSteps.length ? `<div><strong>${profileSteps.filter(done).length}<small> / ${profileSteps.length}</small></strong><span>PROFILE STAGES DONE</span></div>` : ''}${reelSteps.length ? `<div><strong>${reelSteps.filter(done).length}<small> / ${reelSteps.length}</small></strong><span>REEL STAGES DONE</span></div>` : ''}</div>
    ${progress(steps.filter(done).length, steps.length)}
    ${current ? `<p class="run-current">@${esc(current.username)} / ${esc(batch.current_stage || 'collecting')} · Profile ${current.profile_complete ? 'ready' : 'collecting or review'} · Reel grid ${gridLabel(current.reels, current.run)} · Instagram posts ${current.posts_count === null ? 'Error' : number(current.posts_count)}</p>` : ''}
    <div class="run-accounts">${batch.profiles.map((name) => { const profile = state.batchProfiles.find((item) => item.username === name); const stages = batch.results?.[name]?.stages || {}; return `<div><a href="${profileHref(name)}">@${esc(name)}</a><span>${Object.entries(stages).map(([stage, info]) => `${esc(stage.replaceAll('_', ' '))} ${badge(info.status)}`).join(' ')}</span><small>${profile ? `Posts ${profile.posts_count === null ? 'Error' : number(profile.posts_count)} / reel grid ${gridLabel(profile.reels, profile.run)}` : 'Waiting'}</small></div>`; }).join('')}</div>
    ${batch.logs?.length ? `<details class="run-log"><summary>Recent activity</summary><pre>${esc(batch.logs.slice(-18).join('\n'))}</pre></details>` : ''}</section>`;
}

const setupSteps = [
  ['profiles', 'Profiles'], ['mode', 'Collection mode'], ['order', 'Run order'], ['review', 'Review & start'], ['progress', 'Progress']
];

function setupHeader(state, title, description, actions = '') {
  const index = setupSteps.findIndex(([key]) => key === state.setupStep);
  return `<header class="setup-header"><div><span class="eyebrow"><span class="brand-word">deadgram</span> / NEW COLLECTION</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${actions || (state.batch && state.setupStep !== 'progress' ? `<button class="setup-latest" data-action="setup-progress">View latest run →</button>` : '')}</header>
    <ol class="setup-steps" aria-label="Collection setup">${setupSteps.map(([key, label], i) => `<li class="${i === index ? 'active' : i < index ? 'done' : ''}" ${i === index ? 'aria-current="step"' : ''}><span>${String(i + 1).padStart(2, '0')}</span>${esc(label)}</li>`).join('')}</ol>`;
}

function setupActions(back, next, nextDisabled = false, extra = '') {
  return `<div class="setup-actions">${back ? `<button class="button secondary" data-action="setup-back">← Back</button>` : '<span></span>'}<span>${extra}</span>${next ? `<button class="button primary" data-action="setup-next" ${nextDisabled ? 'disabled' : ''}>${esc(next)} →</button>` : ''}</div>`;
}

function modeStep(state) {
  const unavailable = selected(state).filter((profile) => !profile.profile_complete);
  const blocked = state.mode === 'reels_only' && unavailable.length;
  return `${setupHeader(state, 'Choose what to collect', 'Choose one collection strategy for the selected accounts.')}${strategy(state)}
    ${setupActions(true, 'Choose run order', !state.selected.size || blocked, `${number(state.selected.size)} profile${state.selected.size === 1 ? '' : 's'} selected`)}`;
}

function orderStep(state) {
  return `${setupHeader(state, 'Choose run order', 'Choose how the selected accounts will be queued.')}
    <section class="setup-choice"><span class="eyebrow">RUN ORDER</span>${orderControl(state)}
      <p>Fewest posts first uses saved exact post counts. Fewest reels first uses saved finalized reel grid counts. Profiles without the chosen count run last. Selection order follows the order you selected accounts.</p></section>
    ${setupActions(true, 'Review collection', !state.selected.size, `${number(state.selected.size)} profile${state.selected.size === 1 ? '' : 's'} · ${esc(modeOptions.find(([mode]) => mode === state.mode)?.[1] || state.mode)}`)}`;
}

function reviewStep(state) {
  const profiles = selected(state);
  const unavailable = profiles.filter((profile) => !profile.profile_complete);
  const canRun = profiles.length && !running(state) && !state.busy && !state.readOnly && (state.mode !== 'reels_only' || !unavailable.length);
  const mode = modeOptions.find(([value]) => value === state.mode)?.[1] || state.mode;
  const order = state.order === 'posts_ascending' ? 'Fewest posts first' : state.order === 'reels_ascending' ? 'Fewest reels first' : 'Selection order';
  return `${setupHeader(state, 'Review and start', 'Check your choices before starting collection.')}
    <section class="setup-review"><div><span class="eyebrow">PROFILES</span><strong>${number(profiles.length)} selected</strong><p>${profiles.slice(0, 7).map((profile) => `@${esc(profile.username)}`).join(', ')}${profiles.length > 7 ? `, and ${profiles.length - 7} more` : ''}</p><button data-action="setup-step" data-step="profiles">Edit profiles</button></div>
      <div><span class="eyebrow">COLLECTION MODE</span><strong>${esc(mode)}</strong><p>${esc(modeOptions.find(([value]) => value === state.mode)?.[2] || '')}</p><button data-action="setup-step" data-step="mode">Edit mode</button></div>
      <div><span class="eyebrow">RUN ORDER</span><strong>${esc(order)}</strong><p>${state.order === 'posts_ascending' ? 'Saved exact post counts determine order.' : state.order === 'reels_ascending' ? 'Saved finalized reel counts determine order.' : 'Accounts run in the order selected.'}</p><button data-action="setup-step" data-step="order">Edit order</button></div></section>
    ${state.mode === 'reels_only' && unavailable.length ? `<p class="flow-warning">${unavailable.length} selected account${unavailable.length === 1 ? '' : 's'} still need profile details and reel counts before a reels-only run.</p>` : ''}
    <div class="setup-actions"><button class="button secondary" data-action="setup-back">← Back</button><a class="button secondary ${profiles.length ? '' : 'disabled'}" href="/collect/profiles">Collect step by step →</a><button class="button primary" data-action="start" ${canRun ? '' : 'disabled'}>${state.busy ? 'Starting…' : `Run ${number(profiles.length)} selected →`}</button></div>`;
}

function progressStep(state) {
  const actions = '<div class="setup-header-actions"><button class="button secondary" data-action="setup-new">New collection</button><a class="button secondary" href="/collection/review">View saved results →</a></div>';
  return `${setupHeader(state, 'Collection progress', 'Follow the current run and inspect its saved results.', actions)}
    ${runPanel(state)}`;
}

export function renderSelect(state) {
  if (state.setupStep === 'mode') return modeStep(state);
  if (state.setupStep === 'order') return orderStep(state);
  if (state.setupStep === 'review') return reviewStep(state);
  if (state.setupStep === 'progress') return progressStep(state);
  const visible = visibleCatalog(state);
  const reelWorkCount = state.catalog.filter(reelsNeedWork).length;
  return `${setupHeader(state, 'Choose profiles', 'Find and select the accounts you want to collect.')}
    <section class="flow-head"><div><span class="eyebrow">PROFILE CATALOG</span><h2>Pick a collection set</h2><p>Accounts come from the existing bot profile index.</p></div><div class="flow-actions"><button class="button secondary" data-action="select-reel-work" ${reelWorkCount ? '' : 'disabled'}>Select all reel work (${number(reelWorkCount)})</button><button class="button secondary" data-action="select-visible">Select visible</button><button class="button secondary" data-action="clear">Clear</button></div></section>
    <div class="setup-dock"><span><strong>${number(state.selected.size)}</strong> selected</span><button class="button primary" data-action="setup-next" ${state.selected.size ? '' : 'disabled'}>Continue to mode →</button></div>
    <div class="flow-filters"><label>SEARCH PROFILES<input id="catalog-search" type="search" placeholder="Username, country, category, bio" value="${esc(state.search)}"></label><label>SHOW<select id="catalog-filter" aria-label="Filter profiles"><option value="all" ${state.filter === 'all' ? 'selected' : ''}>All profiles</option><option value="uncollected" ${state.filter === 'uncollected' ? 'selected' : ''}>Profile not ready</option><option value="collected" ${state.filter === 'collected' ? 'selected' : ''}>Profile details ready</option><option value="reels_pending" ${state.filter === 'reels_pending' ? 'selected' : ''}>Reels incomplete</option><option value="review" ${state.filter === 'review' ? 'selected' : ''}>Needs review</option></select></label><div class="flow-layout" role="group" aria-label="Profile layout"><button data-action="grid" class="${state.layout === 'grid' ? 'current' : ''}" aria-label="Grid view" aria-pressed="${state.layout === 'grid'}">▦</button><button data-action="list" class="${state.layout === 'list' ? 'current' : ''}" aria-label="List view" aria-pressed="${state.layout === 'list'}">☰</button></div></div>
    <div class="flow-list-title"><span>SHOWING ${number(visible.length)} OF ${number(state.catalog.length)} PROFILES</span><span>${number(state.selected.size)} SELECTED</span></div>
    <div class="flow-profile-list ${state.layout === 'list' ? 'list-layout' : ''}">${visible.map((profile) => {
      const checked = state.selected.has(profile.username);
      const status = profile.profile_header_complete && !profile.profile_complete && profile.run.status === 'complete' ? 'counts_pending' : profile.run.status;
      return `<article class="flow-profile-card ${checked ? 'selected' : ''}"><div class="card-top"><label><input type="checkbox" data-select="${esc(profile.username)}" ${checked ? 'checked' : ''} aria-label="Select ${esc(profile.username)}"><span>Select</span></label>${badge(status)}</div><div class="card-identity">${profile.profile_picture_url ? `<img src="${esc(profile.profile_picture_url)}" alt="" loading="lazy">` : `<span class="fallback">${esc(profile.username[0].toUpperCase())}</span>`}<div><a href="${profileHref(profile.username)}">@${esc(profile.username)}</a><small>${esc(profile.display_name || profile.category || profile.country || 'Instagram profile')}</small></div></div><div class="card-facts"><span>Profile: <strong>${profile.profile_complete ? 'Ready' : profile.profile_header_complete ? 'Counts pending' : profile.profile_fetched_at ? 'Needs review' : 'Not collected'}</strong></span><span>Items scanned: <strong>${number(profile.reels.processed + profile.posts.processed)}</strong></span>${profile.reels.review ? `<span>Reels for review: <strong>${number(profile.reels.review)}</strong></span>` : ''}</div><div class="card-metrics"><div title="${esc(profile.reels.grid_error || '')}"><strong>${profile.profile_fetched_at ? gridLabel(profile.reels, profile.run) : 'Not collected'}</strong><small>REEL GRID COUNT</small></div><div title="${esc(profile.posts_count_error || '')}"><strong>${profile.posts_count === null ? profile.profile_fetched_at ? 'Error' : 'Not collected' : number(profile.posts_count)}</strong><small>INSTAGRAM POSTS</small></div></div>${profile.reels.grid_complete ? progress(profile.reels.processed, profile.reels.discovered) : ''}<div class="card-bottom"><small>${profile.profile_fetched_at ? `Updated ${esc(date(profile.run.updated_at || profile.profile_fetched_at))}` : 'Ready to collect'}</small><span><button data-action="run-one" data-username="${esc(profile.username)}" ${running(state) || state.busy || state.readOnly ? 'disabled' : ''}>Run profile + reels</button><a href="${profileHref(profile.username)}">View profile →</a></span></div></article>`;
    }).join('')}</div>${visible.length ? '' : '<p class="flow-empty">No profiles match this view. Try another search or filter.</p>'}`;
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
    ${orderControl(state)}
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
