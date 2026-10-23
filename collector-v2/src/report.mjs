import { mkdir, writeFile } from 'node:fs/promises';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const csv = (value) => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export async function writeReport(paths, profile, discovery, items, run) {
  await mkdir(paths.base, { recursive: true });
  const rows = [['kind', 'shortcode', 'url', 'date', 'date_precision', 'caption', 'hashtags', 'likes', 'comments', 'views', 'status', 'missing', 'last_error', 'fetched_at']];
  for (const item of items) rows.push([
    item.kind, item.shortcode, item.url, item.date, item.date_precision, item.caption, (item.hashtags || []).join(' '),
    item.likes?.value, item.comments?.value, item.views?.value, item.status,
    (item.missing || []).join('|'), item.last_error, item.fetched_at
  ]);
  await writeFile(paths.csv, rows.map((row) => row.map(csv).join(',')).join('\n') + '\n', 'utf8');
  const profileRows = [
    ['username', 'url', 'fetched_at', 'display_name', 'bio', 'category', 'ai_generated_profile',
      'posts_count', 'followers_count', 'following_count', 'followers_header', 'followers_metadata',
      'following_header', 'following_metadata', 'following_conflict', 'date_joined', 'account_based_in', 'former_usernames_count'],
    [profile?.username, profile?.url, profile?.fetched_at, profile?.display_name, profile?.bio, profile?.category,
      profile?.ai_generated_profile, profile?.posts_count?.value, profile?.followers_count?.value,
      profile?.following_count?.value, profile?.count_evidence?.followers?.header?.raw,
      profile?.count_evidence?.followers?.metadata?.raw, profile?.count_evidence?.following?.header?.raw,
      profile?.count_evidence?.following?.metadata?.raw, profile?.count_evidence?.following?.conflict,
      profile?.date_joined, profile?.account_based_in, profile?.former_usernames_count?.value]
  ];
  await writeFile(paths.profileCsv, profileRows.map((row) => row.map(csv).join(',')).join('\n') + '\n', 'utf8');
  const metric = (field) => profile?.[field] ? `${profile[field].raw}${profile[field].approximate ? ' (rounded)' : ''}` : 'Unknown';
  const count = (kind) => items.filter((item) => item.kind === kind).length;
  const complete = items.filter((item) => item.status === 'complete').length;
  const body = items.map((item) => `<tr><td>${esc(item.kind)}</td><td><a href="${esc(item.url)}">${esc(item.shortcode)}</a></td><td>${esc(item.date || '—')}</td><td>${esc(item.likes?.value ?? '—')}</td><td>${esc(item.comments?.value ?? '—')}</td><td>${esc(item.views?.value ?? '—')}</td><td>${esc(item.status || 'pending')}</td><td>${esc((item.missing || []).join(', ') || item.last_error || '')}</td><td title="${esc(item.caption || '')}">${esc((item.caption || '').slice(0, 130))}</td></tr>`).join('\n');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>dedgram: ${esc(profile?.username || 'edlt.shox')}</title><style>body{font:15px system-ui,sans-serif;max-width:1400px;margin:auto;padding:24px;background:#f7f7f8;color:#171717}a{color:#234bb2}header,.card{background:white;border:1px solid #ddd;border-radius:12px;padding:16px;margin:0 0 16px}h1{margin:0 0 8px}dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}dt{color:#555}dd{margin:3px 0;font-weight:600}table{border-collapse:collapse;width:100%;background:white}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #ddd;padding:8px}th{position:sticky;top:0;background:#eee}.scroll{overflow:auto;max-height:75vh}.muted{color:#555}pre{white-space:pre-wrap}</style><header><h1>${esc(profile?.username || 'edlt.shox')}</h1><p class="muted">Updated ${esc(run?.updated_at || 'never')} · ${complete}/${items.length} complete records</p><dl><div><dt>Followers</dt><dd>${esc(metric('followers_count'))}</dd></div><div><dt>Following</dt><dd>${esc(metric('following_count'))}</dd></div><div><dt>Header posts</dt><dd>${esc(metric('posts_count'))}</dd></div><div><dt>Discovered posts</dt><dd>${count('post')}</dd></div><div><dt>Discovered reels</dt><dd>${count('reel')}</dd></div><div><dt>Category</dt><dd>${esc(profile?.category || 'Unknown')}</dd></div><div><dt>Country</dt><dd>${esc(profile?.account_based_in || 'Unknown')}</dd></div><div><dt>Joined</dt><dd>${esc(profile?.date_joined || 'Unknown')}</dd></div></dl><p>${esc(profile?.bio || '')}</p><p class="muted">Post grid: ${esc(discovery?.post?.complete ? 'complete' : discovery?.post?.error || 'pending')} · Reel grid: ${esc(discovery?.reel?.complete ? 'complete' : discovery?.reel?.error || 'pending')}</p></header><section class="card"><h2>Items</h2><div class="scroll"><table><thead><tr><th>Type</th><th>ID</th><th>Date</th><th>Likes</th><th>Comments</th><th>Views</th><th>Status</th><th>Missing or error</th><th>Caption</th></tr></thead><tbody>${body}</tbody></table></div></section></html>`;
  await writeFile(paths.report, html, 'utf8');
}
