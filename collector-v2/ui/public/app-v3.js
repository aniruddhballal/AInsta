import { api, esc } from './shared.js';
import { steps, visibleCatalog, renderSelect, renderStage, renderReview, batchStrip } from './flow.js';
import { renderProfile } from './profile-v3.js';
import { renderOverview } from './overview.js';

const app = document.querySelector('#app');
const selectionKey = 'dedgram-selected-v2';
const saved = (() => { try { return JSON.parse(localStorage.getItem(selectionKey) || '[]'); } catch { return []; } })();
const state = {
  catalog: [], batch: null, batchProfiles: [], detail: null, overview: null,
  selected: new Set(Array.isArray(saved) ? saved : []),
  search: '', filter: 'all', itemSearch: '', itemFilter: 'all', itemSort: 'newest', busy: false, error: null, readOnly: false
};
const path = () => location.pathname === '/summary' ? '/overview' : location.pathname;
const saveSelection = () => localStorage.setItem(selectionKey, JSON.stringify([...state.selected]));

function render() {
  const focusId = document.activeElement?.id;
  let cursor = null;
  try { cursor = document.activeElement?.selectionStart; } catch {}
  const current = path();
  const step = steps.findIndex((item) => item.path === current);
  document.querySelectorAll('[data-nav]').forEach((link) => link.classList.toggle('active', link.dataset.nav === (current === '/overview' ? 'overview' : 'collection')));
  const content = current === '/overview' ? renderOverview(state)
    : current.startsWith('/profiles/') ? `${batchStrip(state)}${renderProfile(state)}`
      : step === 0 ? renderSelect(state) : step === 4 ? renderReview(state)
        : step > 0 ? renderStage(state, step) : '<p class="loading">Page not found.</p>';
  app.innerHTML = `${state.readOnly ? '<div class="preview-banner">PREVIEW · Collection actions are disabled while the original batch runs.</div>' : ''}${state.error ? `<div class="error-banner" role="alert"><strong>Something needs attention.</strong> ${esc(state.error)} <button data-action="dismiss" aria-label="Dismiss">×</button></div>` : ''}${content}`;
  if (focusId) {
    const input = document.getElementById(focusId);
    if (input) { input.focus(); if (typeof cursor === 'number' && typeof input.setSelectionRange === 'function') input.setSelectionRange(cursor, cursor); }
  }
}

async function refresh() {
  const current = path();
  const calls = [
    api('/api/health').then((result) => { state.readOnly = Boolean(result.read_only); }),
    api('/api/run').then(({ batch, profiles }) => { state.batch = batch; state.batchProfiles = profiles; }),
    api('/api/catalog').then(({ profiles }) => {
      state.catalog = profiles;
      const valid = new Set(profiles.map((profile) => profile.username));
      for (const name of state.selected) if (!valid.has(name)) state.selected.delete(name);
      saveSelection();
    })
  ];
  if (current === '/overview') calls.push(api('/api/summary').then((result) => { state.overview = result; }));
  if (current.startsWith('/profiles/')) calls.push(api(`/api/profiles/${encodeURIComponent(decodeURIComponent(current.slice('/profiles/'.length)))}`).then((result) => { state.detail = result; }));
  await Promise.all(calls);
  render();
}

document.addEventListener('input', (event) => {
  if (event.target.id === 'catalog-search') { state.search = event.target.value; render(); }
  if (event.target.id === 'item-search') { state.itemSearch = event.target.value; render(); }
});
document.addEventListener('change', (event) => {
  const target = event.target;
  if (target.dataset.select) { target.checked ? state.selected.add(target.dataset.select) : state.selected.delete(target.dataset.select); saveSelection(); render(); }
  if (target.id === 'catalog-filter') { state.filter = target.value; render(); }
  if (target.id === 'item-filter') { state.itemFilter = target.value; render(); }
  if (target.id === 'item-sort') { state.itemSort = target.value; render(); }
});
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'dismiss') { state.error = null; render(); return; }
  if (action === 'clear') { state.selected.clear(); saveSelection(); render(); return; }
  if (action === 'select-visible') { for (const profile of visibleCatalog(state)) state.selected.add(profile.username); saveSelection(); render(); return; }
  if (action !== 'run-stage' && action !== 'stop') return;
  state.busy = true; state.error = null; render();
  try {
    const endpoint = action === 'stop' ? '/api/runs/stop' : '/api/runs';
    const body = action === 'stop' ? {} : { profiles: [...state.selected], mode: button.dataset.mode, order: 'selection' };
    await api(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await refresh();
  } catch (error) { state.error = error.message; }
  finally { state.busy = false; render(); }
});

refresh().catch((error) => { state.error = error.message; render(); });
setInterval(() => { if (document.visibilityState !== 'hidden') refresh().catch((error) => { state.error = error.message; render(); }); }, 5000);
