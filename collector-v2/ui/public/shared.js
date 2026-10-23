export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
export const number = (value) => Number(value || 0).toLocaleString();
export const compact = (value) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
export const time = (value) => value ? new Date(value).toLocaleString() : 'Not yet';
export const metric = (value) => value?.source === 'others_plus_one'
  ? number(value.value) : value?.raw ?? (value?.value == null ? '—' : number(value.value));
export const profileHref = (name) => `/profiles/${encodeURIComponent(name)}`;
export const reportHref = (name) => `/reports/${encodeURIComponent(name)}`;
export const statusText = (value) => ({ not_started: 'Not collected', running: 'Running', complete: 'Complete',
  needs_review: 'Needs review', partial: 'Needs review', queued: 'Queued', failed: 'Failed',
  interrupted: 'Interrupted', stopped: 'Stopped', skipped: 'Skipped', counts_pending: 'Counts pending' })[value] || value || 'Not collected';
export const badge = (value) => `<span class="badge ${({ complete: 'good', running: 'active', needs_review: 'warn', partial: 'warn', failed: 'bad', interrupted: 'warn', skipped: 'warn', counts_pending: 'warn' })[value] || 'quiet'}">${esc(statusText(value))}</span>`;
export const progress = (done, total) => `<div class="track"><span style="width:${total ? Math.min(100, Math.round(done / total * 100)) : 0}%"></span></div>`;
export const errorBanner = (error) => error ? `<div class="error-banner" role="alert"><strong>Something needs attention.</strong> ${esc(error)} <button data-action="dismiss" aria-label="Dismiss">×</button></div>` : '';
export async function api(path, options) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}
