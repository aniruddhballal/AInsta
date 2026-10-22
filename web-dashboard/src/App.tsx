import { useCallback, useEffect, useMemo, useState } from 'react';

type PostDate = { url: string; date: string };
type Issue = { id?: string; username?: string; profile_url?: string; post_url?: string; code?: string; message?: string; occurred_at?: string; recommended_action?: string };
type Profile = {
  url: string; username: string; bio?: string; country?: string; date_joined?: string;
  posts_count?: string | number; post_dates?: PostDate[]; status?: string; last_error?: string;
  added_at?: string; last_fetched_at?: string | null; profile_text?: string; about_text?: string;
  collection_issues?: Issue[];
  deep_status?: string;
};
type Job = { id: string; kind: 'surface' | 'deep'; status: string; profile_keys: string[]; index: number; stage: string; post_index: number; post_urls: string[]; started_at: string; last_activity_at?: string };
type Data = { profiles: Profile[]; issues?: Issue[]; workflow?: { active_job?: Job | null; recent_jobs?: Job[] } };
type Tab = 'master' | 'surface' | 'deep' | 'issues';

const API = '/api';
const key = (profile: Profile) => profile.username.toLocaleLowerCase();
const text = (value: unknown) => value == null || value === '' ? '—' : String(value);
const successful = (profile: Profile) => Boolean(profile.last_fetched_at) && profile.status?.toLocaleLowerCase() === 'collected';
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString() : '—';

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
  const [surfaceSelection, setSurfaceSelection] = useState<Set<string>>(new Set());
  const [deepSelection, setDeepSelection] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try { setData(await api<Data>('/state')); setError(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load account data.'); }
  }, []);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 2500); return () => window.clearInterval(timer); }, [refresh]);

  const profiles = data?.profiles || [];
  const visibleProfiles = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return profiles.filter((profile) => !needle || [profile.username, profile.url, profile.bio, profile.country].some((value) => String(value || '').toLocaleLowerCase().includes(needle)));
  }, [profiles, search]);
  const readyForDeep = profiles.filter(successful);
  const activeJob = data?.workflow?.active_job || null;
  const issues = data?.issues || profiles.flatMap((profile) => (profile.collection_issues || []).map((issue) => ({ ...issue, username: issue.username || profile.username })));
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
  async function startJob(kind: 'surface' | 'deep', selected: Set<string>) {
    setBusy(true); setError('');
    try {
      await api('/jobs', { method: 'POST', body: JSON.stringify({ kind, profile_keys: [...selected] }) });
      if (kind === 'surface') setSurfaceSelection(new Set()); else setDeepSelection(new Set());
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

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'master', label: 'Master list', count: profiles.length },
    { id: 'surface', label: 'Surface analysis', count: profiles.filter((p) => Boolean(p.last_fetched_at)).length },
    { id: 'deep', label: 'Deep analysis', count: profiles.filter((p) => p.deep_status === 'Collected').length },
    { id: 'issues', label: 'Issues', count: issues.length }
  ];

  return <main className="shell">
    <header className="topbar"><a className="brand" href="#master" onClick={() => setTab('master')} aria-label="AInsta home"><span className="brand-mark">A</span><span>AINSTA <small>PROFILE ANALYSIS</small></span></a><div className="connection"><i className={activeJob ? 'live' : ''} />{activeJob ? 'JOB RUNNING' : 'LOCAL DATA CONNECTED'}</div></header>
    <section className="intro"><div><p className="eyebrow">PRIVATE WORKSPACE / LOCAL ONLY</p><h1>Bot profiles</h1><p className="lede">Browse the phone catalog, collect profile details, and inspect post dates.</p></div><div className="metric"><strong>{profiles.length}</strong><span>PROFILES</span></div></section>
    {error && <div className="alert" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="Dismiss">×</button></div>}
    {activeJob && <section className="job-card"><div className="job-title"><div><span className="eyebrow">COLLECTION IN PROGRESS</span><h2>{activeJob.kind === 'surface' ? 'Surface analysis' : 'Deep analysis'}</h2></div><button className="button secondary" disabled={busy} onClick={() => void cancelJob()}>Stop</button></div><div className="progress-track"><span style={{ width: `${Math.max(4, (doneCount / activeJob.profile_keys.length) * 100)}%` }} /></div><p className="muted">{doneCount} of {activeJob.profile_keys.length} profiles complete{activeJob.kind === 'deep' ? ` · ${activeJob.post_index} post dates in progress` : ''}</p>{!activeJob.last_activity_at && <p className="collector-wait">Waiting for the Firefox add-on. Load it in Firefox and stay signed in to Instagram.</p>}</section>}
    <nav className="tabs" aria-label="Profile views">{tabs.map((item) => <button key={item.id} className={`tab ${tab === item.id ? 'active' : ''}`} onClick={() => { setTab(item.id); setSearch(''); }}><span>{item.label}</span><b>{item.count}</b></button>)}</nav>
    {!data ? <section className="empty">Connecting to the local account data…</section> : <>
      {tab === 'master' && <section>
        <div className="toolbar"><label className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search username, bio, or country" /></label><button className="button secondary" onClick={() => selectVisible(surfaceSelection, setSurfaceSelection, visibleProfiles)}>{visibleProfiles.length && visibleProfiles.every((profile) => surfaceSelection.has(key(profile))) ? 'Clear visible' : 'Select visible'}</button></div>
        <div className="selection-bar"><span><strong>{surfaceSelection.size}</strong> selected for surface analysis</span><button className="button primary" disabled={!surfaceSelection.size || busy || Boolean(activeJob)} onClick={() => void startJob('surface', surfaceSelection)}>Run surface analysis <span>→</span></button></div>
        <ProfileTable profiles={visibleProfiles} mode="master" selection={surfaceSelection} onToggle={(username) => toggle(surfaceSelection, setSurfaceSelection, username)} />
        {!visibleProfiles.length && <div className="empty">No profiles match “{search}”.</div>}
      </section>}
      {tab === 'surface' && <section>
        <div className="toolbar"><label className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a profile" /></label><span className="helper">Select completed profiles to collect post dates.</span></div>
        <div className="selection-bar"><span><strong>{deepSelection.size}</strong> selected · {readyForDeep.length} ready for deep analysis</span><button className="button primary" disabled={!deepSelection.size || busy || Boolean(activeJob)} onClick={() => void startJob('deep', deepSelection)}>Run deep analysis <span>→</span></button></div>
        <ProfileTable profiles={visibleProfiles.filter((profile) => Boolean(profile.last_fetched_at))} mode="surface" selection={deepSelection} onToggle={(username) => toggle(deepSelection, setDeepSelection, username)} />
      </section>}
      {tab === 'deep' && <section>
        <div className="toolbar"><label className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a profile" /></label><span className="helper">Post dates are collected only after surface analysis succeeds.</span></div>
        <ProfileTable profiles={visibleProfiles.filter(successful)} mode="deep" selection={deepSelection} onToggle={(username) => toggle(deepSelection, setDeepSelection, username)} />
      </section>}
      {tab === 'issues' && <section className="issues">{issues.length ? issues.slice().reverse().map((issue, index) => <article className="issue" key={issue.id || `${issue.username}-${issue.occurred_at}-${index}`}><div className="issue-icon">!</div><div className="issue-body"><div className="issue-head"><strong>@{issue.username || 'Unknown profile'}</strong><span>{text(issue.code)}</span></div><p>{text(issue.message)}</p><small>{fmt(issue.occurred_at)}</small>{issue.recommended_action && <p className="muted">{issue.recommended_action}</p>}</div><div className="issue-links">{issue.profile_url && <a href={issue.profile_url} target="_blank" rel="noreferrer">Profile ↗</a>}{issue.post_url && <a href={issue.post_url} target="_blank" rel="noreferrer">Post ↗</a>}</div></article>) : <div className="empty"><span className="check">✓</span><h3>No issues recorded</h3><p>Collection problems will appear here with the affected profile.</p></div>}</section>}
    </>}
    <footer><span>AINSTA · LOCAL PROFILE DATA</span><span>Reads and writes <code>bot-account-info.json</code></span></footer>
  </main>;
}

function ProfileTable({ profiles, mode, selection, onToggle }: { profiles: Profile[]; mode: 'master' | 'surface' | 'deep'; selection: Set<string>; onToggle: (username: string) => void }) {
  if (!profiles.length) return <div className="empty">{mode === 'surface' ? 'No surface results yet. Select profiles from the master list to begin.' : mode === 'deep' ? 'No post date records yet.' : 'No profiles in the catalog.'}</div>;
  return <div className="table-wrap"><table><thead><tr>{mode !== 'deep' && <th className="check-col"><span className="sr-only">Select</span></th>}<th>PROFILE</th>{mode === 'master' && <><th>PHONE CATALOG ADDED</th><th>SURFACE STATUS</th></>}{mode === 'surface' && <><th>BIO / PROFILE TEXT / ABOUT TEXT</th><th>COUNTRY</th><th>DATE JOINED</th><th>POSTS</th><th>STATUS</th><th>ADDED AT</th><th>LAST FETCHED</th><th>LAST ERROR</th></>}{mode === 'deep' && <><th>POST DATES</th><th>STATUS</th><th>LAST FETCHED</th></>}</tr></thead><tbody>{profiles.map((profile) => <tr key={key(profile)}>
    {mode !== 'deep' && <td><input aria-label={`Select @${profile.username}`} type="checkbox" checked={selection.has(key(profile))} disabled={mode === 'surface' && !successful(profile)} onChange={() => onToggle(key(profile))} /></td>}
    <td><div className="profile-cell"><span className="avatar">{profile.username.slice(0, 1).toLocaleUpperCase()}</span><div><a className="username" href={profile.url} target="_blank" rel="noreferrer">@{profile.username}<span>↗</span></a><small>{profile.url}</small></div></div></td>
    {mode === 'master' && <><td>{fmt(profile.added_at)}</td><td><Status value={profile.last_fetched_at ? profile.status || 'Fetched' : 'Pending'} /></td></>}
    {mode === 'surface' && <><td className="bio-cell"><details><summary>{text(profile.bio).slice(0, 70)}{String(profile.bio || '').length > 70 ? '…' : ''}</summary><pre>{text(profile.bio)}{'\n\nProfile text\n'}{text(profile.profile_text)}{'\n\nAbout text\n'}{text(profile.about_text)}</pre></details></td><td>{text(profile.country)}</td><td>{text(profile.date_joined)}</td><td>{text(profile.posts_count)}</td><td><Status value={profile.status} /></td><td>{fmt(profile.added_at)}</td><td>{fmt(profile.last_fetched_at)}</td><td className="error-text">{text(profile.last_error)}</td></>}
    {mode === 'deep' && <><td><details><summary>{profile.post_dates?.length || 0} dates collected</summary><ul className="post-list">{(profile.post_dates || []).map((post) => <li key={post.url}><a href={post.url} target="_blank" rel="noreferrer">{post.date || 'Date unavailable'} ↗</a></li>)}</ul></details></td><td><Status value={profile.deep_status || 'Pending'} /></td><td>{fmt(profile.last_fetched_at)}</td></>}
  </tr>)}</tbody></table></div>;
}

function Status({ value }: { value?: string }) {
  const lower = String(value || 'Pending').toLocaleLowerCase();
  const type = lower.includes('collect') ? 'good' : lower.includes('fail') || lower.includes('deleted') || lower.includes('error') ? 'bad' : 'pending';
  return <span className={`status ${type}`}><i />{value || 'Pending'}</span>;
}

export default App;
