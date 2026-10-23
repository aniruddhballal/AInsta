import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, ArrowRight, ArrowUpRight, BarChart3, Circle, CircleAlert, CircleCheck, Database, FileText, Globe2, ListFilter, MessageSquareText, Search, Users, X } from 'lucide-react';

type PostDate = { url: string; date: string };
type Issue = { id?: string; username?: string; profile_url?: string; post_url?: string; code?: string; message?: string; occurred_at?: string; recommended_action?: string };
type Profile = {
  url: string; username: string; bio?: string; country?: string; date_joined?: string;
  posts_count?: string | number; post_dates?: PostDate[]; status?: string; last_error?: string;
  added_at?: string; last_fetched_at?: string | null; profile_text?: string; about_text?: string;
  collection_issues?: Issue[];
  deep_status?: string;
  ignored?: boolean;
};
type Job = { id: string; kind: 'surface' | 'deep' | 'post_count'; status: string; profile_keys: string[]; index: number; stage: string; post_index: number; post_urls: string[]; started_at: string; last_activity_at?: string };
type Data = { profiles: Profile[]; issues?: Issue[]; workflow?: { active_job?: Job | null; recent_jobs?: Job[] } };
type Tab = 'master' | 'surface' | 'insights' | 'post_counts' | 'deep' | 'issues';
type SurfaceFilter = 'all' | 'needs_surface' | 'collected' | 'collection_failed' | 'deleted_account' | 'issues' | 'ignored';

const API = '/api';
const numericPostCount = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const match = String(value ?? '').trim().match(/^([\d,.]+)\s*([kmb])?(?:\s+posts?)?$/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return null;
  const multiplier = ({ k: 1_000, m: 1_000_000, b: 1_000_000_000 } as Record<string, number>)[(match[2] || '').toLowerCase()] || 1;
  return Math.round(amount * multiplier);
};
const hasPostCount = (profile: Profile) => numericPostCount(profile.posts_count) != null;
const key = (profile: Profile) => profile.username.toLocaleLowerCase();
const text = (value: unknown) => value == null || value === '' ? '—' : String(value);
const successful = (profile: Profile) => Boolean(profile.last_fetched_at) && profile.status?.toLocaleLowerCase() === 'collected';
const fmt = (value?: string | number | null) => {
  if (value == null || value === '') return '—';
  const numeric = typeof value === 'number' || /^\d{10,13}$/.test(String(value).trim());
  const date = new Date(numeric ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
}

function App() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('master');
  const [search, setSearch] = useState('');
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>('all');
  const [surfaceSelection, setSurfaceSelection] = useState<Set<string>>(new Set());
  const [deepSelection, setDeepSelection] = useState<Set<string>>(new Set());
  const [postCountSelection, setPostCountSelection] = useState<Set<string>>(new Set());
  const [postCountFilter, setPostCountFilter] = useState<'missing' | 'all'>('missing');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const next = await api<Data>('/state');
      setData(next);
      const missingKeys = new Set(next.profiles.filter((profile) => !hasPostCount(profile) && !profile.ignored).map(key));
      setPostCountSelection((current) => new Set([...current].filter((profileKey) => missingKeys.has(profileKey))));
      setError('');
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load account data.'); }
  }, []);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 2500); return () => window.clearInterval(timer); }, [refresh]);

  const profiles = data?.profiles || [];
  const visibleProfiles = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return profiles.filter((profile) => !needle || [profile.username, profile.url, profile.bio, profile.country].some((value) => String(value || '').toLocaleLowerCase().includes(needle)));
  }, [profiles, search]);
  const activeJob = data?.workflow?.active_job || null;
  const issues = data?.issues || profiles.flatMap((profile) => (profile.collection_issues || []).map((issue) => ({ ...issue, username: issue.username || profile.username })));
  const masterProfiles = useMemo(() => visibleProfiles.filter((profile) => {
    if (surfaceFilter === 'ignored') return Boolean(profile.ignored);
    if (profile.ignored) return surfaceFilter === 'all';
    if (surfaceFilter === 'needs_surface') return !successful(profile);
    if (surfaceFilter === 'collected') return successful(profile);
    if (surfaceFilter === 'collection_failed') return profile.status?.toLocaleLowerCase() === 'collection failed';
    if (surfaceFilter === 'deleted_account') return profile.status?.toLocaleLowerCase() === 'deleted account';
    if (surfaceFilter === 'issues') return Boolean(profile.last_error || profile.collection_issues?.length || issues.some((issue) => issue.username?.toLocaleLowerCase() === key(profile)));
    return true;
  }), [visibleProfiles, surfaceFilter, issues]);
  const postCountProfiles = visibleProfiles.filter((profile) => !profile.ignored && (postCountFilter === 'all' || !hasPostCount(profile)));
  const postCountSelectable = postCountProfiles.filter((profile) => !hasPostCount(profile));
  const readyForDeep = profiles.filter(successful);
  const doneCount = activeJob ? Math.min(activeJob.index, activeJob.profile_keys.length) : 0;

  function toggle(selection: Set<string>, setter: (next: Set<string>) => void, username: string) {
    const next = new Set(selection);
    next.has(username) ? next.delete(username) : next.add(username);
    setter(next);
  }
  function selectVisible(selection: Set<string>, setter: (next: Set<string>) => void, candidates: Profile[]) {
    const next = new Set(selection);
    const allSelected = candidates.length > 0 && candidates.every((profile) => next.has(key(profile)));
    for (const profile of candidates) allSelected ? next.delete(key(profile)) : next.add(key(profile));
    setter(next);
  }
  async function startJob(kind: 'surface' | 'deep' | 'post_count', selected: Set<string>) {
    setBusy(true); setError('');
    try {
      await api('/jobs', { method: 'POST', body: JSON.stringify({ kind, profile_keys: [...selected] }) });
      if (kind === 'surface') setSurfaceSelection(new Set());
      else if (kind === 'deep') setDeepSelection(new Set());
      else setPostCountSelection(new Set());
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not start collection.'); }
    finally { setBusy(false); }
  }
  async function cancelJob() {
    setBusy(true);
    try { await api('/jobs/cancel', { method: 'POST' }); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not stop collection.'); }
    finally { setBusy(false); }
  }
  async function setIgnored(username: string, ignored: boolean) {
    setError('');
    try {
      await api('/profiles/ignore', { method: 'POST', body: JSON.stringify({ profile_key: username.toLocaleLowerCase(), ignored }) });
      if (ignored) {
        setSurfaceSelection((current) => { const next = new Set(current); next.delete(username.toLocaleLowerCase()); return next; });
        setDeepSelection((current) => { const next = new Set(current); next.delete(username.toLocaleLowerCase()); return next; });
      }
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update profile.'); }
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'master', label: 'Master list', count: profiles.length },
    { id: 'surface', label: 'Surface analysis', count: profiles.filter((p) => Boolean(p.last_fetched_at)).length },
    { id: 'insights', label: 'Insights', count: profiles.filter((p) => Boolean(p.last_fetched_at)).length },
    { id: 'post_counts', label: 'Post counts', count: profiles.filter((p) => !p.ignored && !hasPostCount(p)).length },
    { id: 'deep', label: 'Deep analysis', count: profiles.filter((p) => p.deep_status === 'Collected').length },
    { id: 'issues', label: 'Issues', count: issues.length }
  ];

  return <main className="shell">
    <header className="topbar"><a className="brand" href="#master" onClick={() => setTab('master')} aria-label="dedgram home"><span className="brand-mark">d</span><span>dedgram <small>PROFILE ANALYSIS</small></span></a><div className="connection"><span className="connection-icon" aria-hidden="true">{activeJob ? <Activity /> : <Database />}</span>{activeJob ? 'JOB RUNNING' : 'LOCAL DATA CONNECTED'}</div></header>
    <section className="intro"><div><p className="eyebrow">PRIVATE WORKSPACE / LOCAL ONLY</p><h1>Bot profiles</h1><p className="lede">Browse the phone catalog, collect profile details, and inspect post dates.</p></div><div className="metric"><strong>{profiles.length}</strong><span>PROFILES</span></div></section>
    {error && <div className="alert" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="Dismiss"><X aria-hidden="true" /></button></div>}
    {activeJob && <section className="job-card"><div className="job-title"><div><span className="eyebrow">COLLECTION IN PROGRESS</span><h2>{activeJob.kind === 'surface' ? 'Surface analysis' : activeJob.kind === 'post_count' ? 'Post count refresh' : 'Deep analysis'}</h2></div><button className="button secondary" disabled={busy} onClick={() => void cancelJob()}>Stop</button></div><div className="progress-track"><span style={{ width: `${Math.max(4, (doneCount / activeJob.profile_keys.length) * 100)}%` }} /></div><p className="muted">{doneCount} of {activeJob.profile_keys.length} profiles complete{activeJob.kind === 'deep' ? ` · ${activeJob.post_index} post dates in progress` : ''}</p>{!activeJob.last_activity_at && <p className="collector-wait">Waiting for the Firefox add-on. Load it in Firefox and stay signed in to Instagram.</p>}</section>}
    <nav className="tabs" aria-label="Profile views">{tabs.map((item) => <button key={item.id} className={`tab ${tab === item.id ? 'active' : ''}`} onClick={() => { setTab(item.id); setSearch(''); }}><span>{item.label}</span><b>{item.count}</b></button>)}</nav>
    {!data ? <section className="empty">Connecting to the local account data…</section> : <>
      {tab === 'master' && <section>
        <div className="toolbar"><label className="search"><Search className="ui-icon search-icon" size={17} strokeWidth={1.8} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search username, bio, or country" /></label><label className="filter-select"><ListFilter className="ui-icon filter-icon" size={16} strokeWidth={1.8} aria-hidden="true" /><span className="sr-only">Filter profiles by surface status</span><select value={surfaceFilter} onChange={(event) => setSurfaceFilter(event.target.value as SurfaceFilter)} aria-label="Filter profiles by surface status"><option value="all">All profiles</option><option value="needs_surface">Needs surface analysis</option><option value="collected">Surface complete</option><option value="collection_failed">Collection failed</option><option value="deleted_account">Deleted account</option><option value="issues">Has issues</option><option value="ignored">Ignored</option></select></label><button className="button secondary" onClick={() => selectVisible(surfaceSelection, setSurfaceSelection, masterProfiles.filter((profile) => !profile.ignored))}>{masterProfiles.some((profile) => !profile.ignored) && masterProfiles.filter((profile) => !profile.ignored).every((profile) => surfaceSelection.has(key(profile))) ? 'Clear visible' : 'Select visible'}</button></div>
        <div className="selection-bar"><span><strong>{masterProfiles.length}</strong> visible <span className="count-separator" aria-hidden="true">·</span> <strong>{surfaceSelection.size}</strong> selected for surface analysis</span><button className="button primary" disabled={!surfaceSelection.size || busy || Boolean(activeJob)} onClick={() => void startJob('surface', surfaceSelection)}>Run surface analysis <ArrowRight className="ui-icon button-icon" size={15} strokeWidth={1.8} aria-hidden="true" /></button></div>
        <ProfileTable profiles={masterProfiles} mode="master" selection={surfaceSelection} onToggle={(username) => toggle(surfaceSelection, setSurfaceSelection, username)} onIgnore={(username, ignored) => void setIgnored(username, ignored)} />
        {!masterProfiles.length && <div className="empty">No profiles match the current search and status filter.</div>}
      </section>}
      {tab === 'surface' && <section>
        <div className="toolbar"><label className="search"><Search className="ui-icon search-icon" size={17} strokeWidth={1.8} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a profile" /></label><span className="helper">Select completed profiles to collect post dates.</span></div>
        <div className="selection-bar"><span><strong>{deepSelection.size}</strong> selected · {readyForDeep.length} ready for deep analysis</span><button className="button primary" disabled={!deepSelection.size || busy || Boolean(activeJob)} onClick={() => void startJob('deep', deepSelection)}>Run deep analysis <ArrowRight className="ui-icon button-icon" size={15} strokeWidth={1.8} aria-hidden="true" /></button></div>
        <ProfileTable profiles={visibleProfiles.filter((profile) => Boolean(profile.last_fetched_at))} mode="surface" selection={deepSelection} onToggle={(username) => toggle(deepSelection, setDeepSelection, username)} />
      </section>}
      {tab === 'insights' && <InsightsView profiles={profiles} />}
      {tab === 'post_counts' && <section>
        <div className="toolbar"><label className="search"><Search className="ui-icon search-icon" size={17} strokeWidth={1.8} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search username or bio" /></label><label className="filter-select"><ListFilter className="ui-icon filter-icon" size={16} strokeWidth={1.8} aria-hidden="true" /><select value={postCountFilter} onChange={(event) => setPostCountFilter(event.target.value as 'missing' | 'all')} aria-label="Filter by post count"><option value="missing">Missing post count</option><option value="all">All profiles</option></select></label><button className="button secondary" disabled={!postCountSelectable.length} onClick={() => selectVisible(postCountSelection, setPostCountSelection, postCountSelectable)}>{postCountSelectable.length > 0 && postCountSelectable.every((profile) => postCountSelection.has(key(profile))) ? 'Clear visible' : 'Select visible'}</button></div>
        <div className="selection-bar"><span><strong>{postCountProfiles.length}</strong> visible <span className="count-separator" aria-hidden="true">·</span> <strong>{postCountSelection.size}</strong> selected for post count refresh</span><button className="button primary" disabled={!postCountSelection.size || busy || Boolean(activeJob)} onClick={() => void startJob('post_count', postCountSelection)}>Fetch post counts <ArrowRight className="ui-icon button-icon" size={15} strokeWidth={1.8} aria-hidden="true" /></button></div>
        <p className="helper post-count-help">On success, this updates only <code>posts_count</code>. Failed attempts are recorded in Issues; other surface fields and post-date data stay untouched.</p>
        <PostCountTable profiles={postCountProfiles} selection={postCountSelection} onToggle={(username) => toggle(postCountSelection, setPostCountSelection, username)} />
      </section>}
      {tab === 'deep' && <section>
        <div className="toolbar"><label className="search"><Search className="ui-icon search-icon" size={17} strokeWidth={1.8} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a profile" /></label><span className="helper">Post dates are collected only after surface analysis succeeds.</span></div>
        <ProfileTable profiles={visibleProfiles.filter(successful)} mode="deep" selection={deepSelection} onToggle={(username) => toggle(deepSelection, setDeepSelection, username)} />
      </section>}
      {tab === 'issues' && <section className="issues">{issues.length ? issues.slice().reverse().map((issue, index) => { const affected = profiles.find((profile) => key(profile) === issue.username?.toLocaleLowerCase()); return <article className="issue" key={issue.id || `${issue.username}-${issue.occurred_at}-${index}`}><div className="issue-icon"><CircleAlert aria-hidden="true" /></div><div className="issue-body"><div className="issue-head"><strong>@{issue.username || 'Unknown profile'}</strong><span>{text(issue.code)}</span></div><p>{text(issue.message)}</p><small>{fmt(issue.occurred_at)}</small>{issue.recommended_action && <p className="muted">{issue.recommended_action}</p>}</div><div className="issue-links">{issue.profile_url && <a href={issue.profile_url} target="_blank" rel="noreferrer">Profile <ArrowUpRight className="ui-icon link-icon" aria-hidden="true" /></a>}{issue.post_url && <a href={issue.post_url} target="_blank" rel="noreferrer">Post <ArrowUpRight className="ui-icon link-icon" aria-hidden="true" /></a>}{affected && <button className="link-button" onClick={() => void setIgnored(affected.username, !affected.ignored)}>{affected.ignored ? 'Restore profile' : 'Ignore profile'}</button>}</div></article>; }) : <div className="empty"><span className="check"><CircleCheck aria-hidden="true" /></span><h3>No issues recorded</h3><p>Collection problems will appear here with the affected profile.</p></div>}</section>}
    </>}
    <footer><span>dedgram · LOCAL PROFILE DATA</span><span>Reads and writes <code>bot-account-info.json</code></span></footer>
  </main>;
}

function ProfileTable({ profiles, mode, selection, onToggle, onIgnore }: { profiles: Profile[]; mode: 'master' | 'surface' | 'deep'; selection: Set<string>; onToggle: (username: string) => void; onIgnore?: (username: string, ignored: boolean) => void }) {
  if (!profiles.length) return <div className="empty">{mode === 'surface' ? 'No surface results yet. Select profiles from the master list to begin.' : mode === 'deep' ? 'No post date records yet.' : 'No profiles in the catalog.'}</div>;
  return <div className="table-wrap"><table><thead><tr>{mode !== 'deep' && <th className="check-col"><span className="sr-only">Select</span></th>}<th>PROFILE</th>{mode === 'master' && <><th>PHONE CATALOG ADDED</th><th>SURFACE STATUS</th><th>REVIEW</th></>}{mode === 'surface' && <><th>BIO / PROFILE TEXT / ABOUT TEXT</th><th>COUNTRY</th><th>DATE JOINED</th><th>POSTS</th><th>STATUS</th><th>ADDED AT</th><th>LAST FETCHED</th><th>LAST ERROR</th></>}{mode === 'deep' && <><th>POST DATES</th><th>STATUS</th><th>LAST FETCHED</th></>}</tr></thead><tbody>{profiles.map((profile) => <tr key={key(profile)}>
    {mode !== 'deep' && <td><input aria-label={`Select @${profile.username}`} type="checkbox" checked={selection.has(key(profile))} disabled={profile.ignored || (mode === 'surface' && !successful(profile))} onChange={() => onToggle(key(profile))} /></td>}
    <td><div className="profile-cell"><span className="avatar">{profile.username.slice(0, 1).toLocaleUpperCase()}</span><div><a className="username" href={profile.url} target="_blank" rel="noreferrer">@{profile.username}<ArrowUpRight className="ui-icon link-icon" aria-hidden="true" /></a><small>{profile.url}</small></div></div></td>
    {mode === 'master' && <><td>{fmt(profile.added_at)}</td><td><Status value={profile.ignored ? 'Ignored' : profile.last_fetched_at ? profile.status || 'Fetched' : 'Pending'} /></td><td><button className="link-button" onClick={() => onIgnore?.(profile.username, !profile.ignored)}>{profile.ignored ? 'Restore' : 'Ignore'}</button></td></>}
    {mode === 'surface' && <><td className="bio-cell"><details><summary>{text(profile.bio).slice(0, 70)}{String(profile.bio || '').length > 70 ? '…' : ''}</summary><pre>{text(profile.bio)}{'\n\nProfile text\n'}{text(profile.profile_text)}{'\n\nAbout text\n'}{text(profile.about_text)}</pre></details></td><td>{text(profile.country)}</td><td>{text(profile.date_joined)}</td><td>{text(profile.posts_count)}</td><td><Status value={profile.status} /></td><td>{fmt(profile.added_at)}</td><td>{fmt(profile.last_fetched_at)}</td><td className="error-text">{text(profile.last_error)}</td></>}
    {mode === 'deep' && <><td><details><summary>{profile.post_dates?.length || 0} dates collected</summary><ul className="post-list">{(profile.post_dates || []).map((post) => <li key={post.url}><a href={post.url} target="_blank" rel="noreferrer">{post.date || 'Date unavailable'} <ArrowUpRight className="ui-icon link-icon" aria-hidden="true" /></a></li>)}</ul></details></td><td><Status value={profile.deep_status || 'Pending'} /></td><td>{fmt(profile.last_fetched_at)}</td></>}
  </tr>)}</tbody></table></div>;
}

function PostCountTable({ profiles, selection, onToggle }: { profiles: Profile[]; selection: Set<string>; onToggle: (username: string) => void }) {
  if (!profiles.length) return <div className="empty"><h3>No matching profiles</h3><p>Profiles with missing post counts will appear here.</p></div>;
  return <div className="table-wrap"><table className="post-count-table"><thead><tr><th className="check-col"><span className="sr-only">Select</span></th><th>PROFILE</th><th>POST COUNT</th><th>SURFACE STATUS</th><th>LAST FETCHED</th></tr></thead><tbody>{profiles.map((profile) => <tr key={key(profile)}><td><input aria-label={`Select @${profile.username} for post count refresh`} type="checkbox" checked={selection.has(key(profile))} disabled={hasPostCount(profile)} onChange={() => onToggle(key(profile))} /></td><td><div className="profile-cell"><span className="avatar">{profile.username.slice(0, 1).toLocaleUpperCase()}</span><div><a className="username" href={profile.url} target="_blank" rel="noreferrer">@{profile.username}<ArrowUpRight className="ui-icon link-icon" aria-hidden="true" /></a><small>{profile.url}</small></div></div></td><td><span className={hasPostCount(profile) ? '' : 'missing-post-count'}>{text(profile.posts_count)}</span></td><td><Status value={profile.status || 'Not analyzed'} /></td><td>{fmt(profile.last_fetched_at)}</td></tr>)}</tbody></table></div>;
}

function Status({ value }: { value?: string }) {
  const lower = String(value || 'Pending').toLocaleLowerCase();
  const type = lower.includes('collect') ? 'good' : lower.includes('fail') || lower.includes('deleted') || lower.includes('error') ? 'bad' : 'pending';
  return <span className={`status ${type}`}><Circle aria-hidden="true" />{value || 'Pending'}</span>;
}

function postCount(profile: Profile): number | null {
  const direct = numericPostCount(profile.posts_count);
  if (direct != null) return direct;
  const fromProfileText = profile.profile_text?.match(/(?:^|\n)\s*([\d,.]+)\s*([kmb])?\s+posts?\b/i);
  return fromProfileText ? numericPostCount(`${fromProfileText[1]}${fromProfileText[2] || ''}`) : null;
}

function InsightsView({ profiles }: { profiles: Profile[] }) {
  const scanned = profiles.filter((profile) => Boolean(profile.last_fetched_at));
  const countries = scanned.reduce((counts, profile) => {
    const country = String(profile.country || '').trim();
    if (country && !/^(not shared|not shown|unknown|n\/a)$/i.test(country)) {
      const label = country.replace(/\s+/g, ' ');
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return counts;
  }, new Map<string, number>());
  const countryRows = [...countries].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const postRows = scanned.map((profile) => ({ profile, count: postCount(profile) })).filter((item): item is { profile: Profile; count: number } => item.count != null);
  const sortedPostCounts = postRows.map((item) => item.count).sort((a, b) => a - b);
  const averagePosts = sortedPostCounts.length ? sortedPostCounts.reduce((sum, count) => sum + count, 0) / sortedPostCounts.length : 0;
  const medianPosts = sortedPostCounts.length ? sortedPostCounts.length % 2
    ? sortedPostCounts[Math.floor(sortedPostCounts.length / 2)]
    : (sortedPostCounts[sortedPostCounts.length / 2 - 1] + sortedPostCounts[sortedPostCounts.length / 2]) / 2 : 0;
  const postBuckets = [
    { label: '0–99', count: postRows.filter(({ count }) => count < 100).length },
    { label: '100–499', count: postRows.filter(({ count }) => count >= 100 && count < 500).length },
    { label: '500–999', count: postRows.filter(({ count }) => count >= 500 && count < 1_000).length },
    { label: '1K–4.9K', count: postRows.filter(({ count }) => count >= 1_000 && count < 5_000).length },
    { label: '5K+', count: postRows.filter(({ count }) => count >= 5_000).length }
  ];
  const statuses = scanned.reduce((counts, profile) => {
    const label = String(profile.status || 'Unspecified').trim() || 'Unspecified';
    counts.set(label, (counts.get(label) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  const statusRows = [...statuses].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const joinYears = scanned.reduce((counts, profile) => {
    const year = String(profile.date_joined || '').match(/\b(?:19|20)\d{2}\b/)?.[0];
    if (year) counts.set(year, (counts.get(year) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  const joinYearRows = [...joinYears].sort((a, b) => a[0].localeCompare(b[0]));
  const bioGroups = new Map<string, { bio: string; profiles: Profile[] }>();
  for (const profile of scanned) {
    const bio = String(profile.bio || '').trim().replace(/\s+/g, ' ').normalize('NFC');
    if (!bio) continue;
    const normalized = bio.toLocaleLowerCase();
    const group = bioGroups.get(normalized) || { bio, profiles: [] };
    group.profiles.push(profile);
    bioGroups.set(normalized, group);
  }
  const repeatedBios = [...bioGroups.values()].filter((group) => group.profiles.length > 1)
    .sort((a, b) => b.profiles.length - a.profiles.length || a.bio.localeCompare(b.bio)).slice(0, 6);
  const maxCountry = Math.max(1, ...countryRows.map(([, count]) => count));
  const maxStatus = Math.max(1, ...statusRows.map(([, count]) => count));
  const maxJoinYear = Math.max(1, ...joinYearRows.map(([, count]) => count));
  const maxPosts = Math.max(1, ...postBuckets.map((bucket) => bucket.count));
  const missingCountries = scanned.length - countryRows.reduce((sum, [, count]) => sum + count, 0);
  const fetchedAt = scanned.map((profile) => profile.last_fetched_at || '').sort().at(-1);

  return <section className="insights-view">
    <div className="insights-heading"><div><p className="eyebrow">SURFACE ANALYSIS / SUMMARY</p><h2>Profile insights</h2><p className="lede">A live summary of the profile data collected so far.</p></div><span className="insights-updated">{fetchedAt ? `Latest fetch ${fmt(fetchedAt)}` : 'No surface results yet'}</span></div>
    {!scanned.length ? <div className="empty"><BarChart3 className="ui-icon" size={24} /><h3>No surface data to summarize</h3><p>Run surface analysis on profiles to see country, post-count, and bio patterns here.</p></div> : <>
      <div className="insight-stats">
        <InsightStat icon={<Users />} label="Profiles scanned" value={scanned.length.toLocaleString()} detail={`${profiles.length.toLocaleString()} total in the catalog`} />
        <InsightStat icon={<Globe2 />} label="Countries identified" value={countryRows.length.toLocaleString()} detail={`${(scanned.length - missingCountries).toLocaleString()} profiles · ${missingCountries.toLocaleString()} not shared or unavailable`} />
        <InsightStat icon={<BarChart3 />} label="Average posts" value={postRows.length ? Math.round(averagePosts).toLocaleString() : '—'} detail={postRows.length ? `Median ${Math.round(medianPosts).toLocaleString()} · based on ${postRows.length} profiles` : 'No numeric post counts available'} />
        <InsightStat icon={<MessageSquareText />} label="Repeated bios" value={repeatedBios.length ? repeatedBios.length.toLocaleString() : '0'} detail={repeatedBios.length ? `${repeatedBios[0].profiles.length} profiles share the most common bio` : 'No exact bio repeats found'} />
      </div>

      <div className="insight-grid">
        <InsightPanel icon={<Globe2 />} title="Accounts by country" meta={`${countryRows.length} countries`}>
          {countryRows.length ? <><div className="insight-bars">{countryRows.slice(0, 8).map(([country, count]) => <InsightBar key={country} label={country} count={count} total={scanned.length} max={maxCountry} />)}</div>{missingCountries > 0 && <p className="insight-note">Country unavailable for {missingCountries} scanned {missingCountries === 1 ? 'profile' : 'profiles'}.</p>}</> : <p className="insight-note">No country values were shared in the scanned profiles.</p>}
        </InsightPanel>
        <InsightPanel icon={<FileText />} title="Profile status" meta={`${scanned.length} scan results`}>
          <div className="insight-bars">{statusRows.map(([status, count]) => <InsightBar key={status} label={status} count={count} total={scanned.length} max={maxStatus} />)}</div>
        </InsightPanel>
        <InsightPanel icon={<BarChart3 />} title="Post-count distribution" meta={`${postRows.length} of ${scanned.length} readable`}>
          {postRows.length ? <><div className="insight-bars">{postBuckets.map((bucket) => <InsightBar key={bucket.label} label={bucket.label} count={bucket.count} total={postRows.length} max={maxPosts} />)}</div><p className="insight-note">Mean {Math.round(averagePosts).toLocaleString()} posts · median {Math.round(medianPosts).toLocaleString()} · range {sortedPostCounts[0].toLocaleString()}–{sortedPostCounts.at(-1)?.toLocaleString()}</p></> : <p className="insight-note">Post counts were hidden or unavailable in the scanned profiles.</p>}
        </InsightPanel>
        <InsightPanel icon={<Users />} title="Accounts by join year" meta={`${joinYearRows.reduce((sum, [, count]) => sum + count, 0)} dates found`}>
          {joinYearRows.length ? <div className="insight-bars">{joinYearRows.map(([year, count]) => <InsightBar key={year} label={year} count={count} total={scanned.length} max={maxJoinYear} />)}</div> : <p className="insight-note">No join years could be read from the scanned profiles.</p>}
        </InsightPanel>
        <InsightPanel className="wide" icon={<MessageSquareText />} title="Repeated bios" meta={`${bioGroups.size} distinct non-empty bios`}>
          {repeatedBios.length ? <div className="repeated-bios">{repeatedBios.map((group) => <article className="repeated-bio" key={group.bio.toLocaleLowerCase()}><div className="repeat-count">{group.profiles.length}<small>accounts</small></div><div className="repeat-copy"><p>{group.bio}</p><div className="repeat-profiles">{group.profiles.slice(0, 8).map((profile) => <a key={key(profile)} href={profile.url} target="_blank" rel="noreferrer">@{profile.username}</a>)}{group.profiles.length > 8 && <span>+{group.profiles.length - 8} more</span>}</div></div></article>)}</div> : <div className="no-repeats"><span>Each non-empty bio is unique across these scanned profiles.</span><strong>{bioGroups.size.toLocaleString()} distinct bios</strong></div>}
        </InsightPanel>
      </div>
      <p className="insights-footnote">Country and join-year summaries exclude values that weren’t shared or could not be read. Post statistics use numeric counts where available, including counts visible in the collected profile text. Bio matches ignore capitalization and whitespace only.</p>
    </>}
  </section>;
}

function InsightStat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return <article className="insight-stat"><div className="insight-stat-top"><span className="insight-stat-icon">{icon}</span><span>{label}</span></div><strong>{value}</strong><p>{detail}</p></article>;
}

function InsightPanel({ icon, title, meta, className = '', children }: { icon: ReactNode; title: string; meta: string; className?: string; children: ReactNode }) {
  return <article className={`insight-panel ${className}`}><header><div className="insight-panel-title"><span className="insight-panel-icon">{icon}</span><h3>{title}</h3></div><span>{meta}</span></header>{children}</article>;
}

function InsightBar({ label, count, total, max }: { label: string; count: number; total: number; max: number }) {
  return <div className="insight-bar-row"><span>{label}</span><div className="insight-bar-track"><span style={{ width: `${count ? Math.max(3, count / max * 100) : 0}%` }} /></div><strong>{count}</strong><small>{total ? `${Math.round(count / total * 100)}%` : '0%'}</small></div>;
}

export default App;
