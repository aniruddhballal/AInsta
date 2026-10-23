import { api } from './shared.js';
import { filteredCatalog, renderQueue } from './queue.js';
import { renderProfile } from './profile.js';
import { renderOverview } from './overview.js';

const app = document.querySelector('#app');
const saved = (() => { try { return JSON.parse(localStorage.getItem('dedgram-selected-v2') || '[]'); } catch { return []; } })();
const state = {
  catalog: [], batch: null, batchProfiles: [], detail: null, overview: null,
  selected: new Set(Array.isArray(saved) ? saved : []),
  search: '', filter: 'all', layout: 'grid', itemSearch: '', itemFilter: 'all', itemSort: 'newest',
  busy: false, error: null
};

function route() {
  const path = decodeURIComponent(location.pathname);
  if (path === '/summary') return { page: 'summary' };
  if (path.startsWith('/profiles/')) return { page: 'profile', username: path.slice('/profiles/'.length) };
  return { page: 'queue' };
}

function render() {
  const focused = document.activeElement?.id;
  let cursor;
  try { cursor = document.activeElement?.selectionStart; } catch { cursor = null; }
  const page = route().page;
  document.querySelectorAll('[data-nav]').forEach((link) => link.classList.toggle('active', link.dataset.nav === (page === 'summary' ? 'summary' : 'queue')));
  app.innerHTML = page === 'summary' ? renderOverview(state) : page === 'profile' ? renderProfile(state) : renderQueue(state);
  if (focused && document.getElementById(focused)) {
    const input = document.getElementById(focused);
    input.focus();
    if (typeof cursor === 'number' && typeof input.setSelectionRange === 'function') input.setSelectionRange(cursor, cursor);
  }
}

function saveSelection() { localStorage.setItem('dedgram-selected-v2', JSON.stringify([...state.selected])); }

async function refresh() {
  const page = route();
  const tasks = [api('/api/run').then((result) => { state.batch = result.batch; state.batchProfiles = result.profiles; })];
  if (page.page === 'queue') tasks.push(api('/api/catalog').then((result) => {
    state.catalog = result.profiles;
    const valid = new Set(result.profiles.map((profile) => profile.username));
    for (const name of state.selected) if (!valid.has(name)) state.selected.delete(name);
    saveSelection();
  }));
  if (page.page === 'profile') tasks.push(api(`/api/profiles/${encodeURIComponent(page.username)}`).then((result) => { state.detail = result; }));
  if (page.page === 'summary') tasks.push(api('/api/summary').then((result) => { state.overview = result; }));
  await Promise.all(tasks);
  render();
}

document.addEventListener('input', (event) => {
  if (event.target.id === 'catalog-search') { state.search = event.target.value; render(); }
  if (event.target.id === 'item-search') { state.itemSearch = event.target.value; render(); }
});
document.addEventListener('change', (event) => {
  const target = event.target;
  if (target.dataset.select) {
    target.checked ? state.selected.add(target.dataset.select) : state.selected.delete(target.dataset.select);
    saveSelection(); render();
  }
  if (target.id === 'catalog-filter') { state.filter = target.value; render(); }
  if (target.id === 'item-filter') { state.itemFilter = target.value; render(); }
  if (target.id === 'item-sort') { state.itemSort = target.value; render(); }
});
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'dismiss') { state.error = null; render(); return; }
  if (action === 'grid' || action === 'list') { state.layout = action; render(); return; }
  if (action === 'clear') { state.selected.clear(); saveSelection(); render(); return; }
  if (action === 'select-visible') { for (const profile of filteredCatalog(state)) state.selected.add(profile.username); saveSelection(); render(); return; }
  if (action === 'start' || action === 'stop') {
    state.busy = true; state.error = null; render();
    try {
      if (action === 'start') await api('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profiles: [...state.selected] }) });
      else await api('/api/runs/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      await refresh();
    } catch (error) { state.error = error.message; }
    finally { state.busy = false; render(); }
  }
});

refresh().catch((error) => { state.error = error.message; render(); });
setInterval(() => {
  if (document.visibilityState === 'hidden') return;
  refresh().catch((error) => { state.error = error.message; render(); });
}, 4000);
