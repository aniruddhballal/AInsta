import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, ArrowRight, ArrowUpRight, BarChart3, Circle, CircleAlert, CircleCheck, Database, FileText, Globe2, ListFilter, MessageSquareText, Search, Users, X } from 'lucide-react';

type PostDate = { url: string; date: string };
type ContentRecord = { url: string; kind?: 'post' | 'reel'; date?: string | null; likes_count?: number | null; comments_count?: number | null; views_count?: number | null; last_fetched_at?: string; fetch_status?: string; fetch_errors?: { field: string; message: string }[] };
type Issue = { id?: string; username?: string; profile_url?: string; post_url?: string; code?: string; message?: string; occurred_at?: string; recommended_action?: string };
type Profile = {
  url: string; username: string; bio?: string; country?: string; date_joined?: string;
  posts_count?: string | number; reels_count?: string | number; reels_count_status?: string; reels_count_last_attempt_at?: string;
  post_dates?: PostDate[]; status?: string; last_error?: string;
  post_records?: ContentRecord[]; reel_records?: ContentRecord[];
  posts_data_status?: string; posts_data_last_fetched_at?: string;
  reels_data_status?: string; reels_data_last_fetched_at?: string;
  added_at?: string; catalog_first_seen_at?: string; last_fetched_at?: string | null; profile_text?: string; about_text?: string;
  collection_issues?: Issue[];
  deep_status?: string;
  ignored?: boolean;
};
type Job = { id: string; kind: 'surface' | 'deep' | 'post_count' | 'reels_count' | 'post_content' | 'reel_content'; status: string; profile_keys: string[]; index: number; stage: string; post_index: number; post_urls: string[]; content_index?: number; content_urls?: string[]; started_at: string; updated_at?: string; completed_at?: string; last_activity_at?: string };
type Data = { profiles: Profile[]; issues?: Issue[]; workflow?: { active_job?: Job | null; recent_jobs?: Job[] } };
type Tab = 'master' | 'surface' | 'insights' | 'post_counts' | 'reel_counts' | 'deep' | 'issues';
type SurfaceFilter = 'all' | 'needs_surface' | 'collected' | 'collection_failed' | 'deleted_account' | 'issues' | 'ignored';

const API = '/api';
const TAB_ROUTES: Record<Tab, string> = {
  master: '/', surface: '/surface-analysis', insights: '/insights', post_counts: '/post-counts',
  reel_counts: '/reel-counts', deep: '/deep-analysis', issues: '/issues'
};
function tabFromPath(pathname: string): Tab {
  const path = pathname.replace(/\/+$/, '') || '/';
  return (Object.entries(TAB_ROUTES).find(([, route]) => route === path)?.[0] as Tab | undefined) || 'master';
}
function profileFromPath(pathname: string): string | null {
  const path = pathname.replace(/^\/+|\/+$/g, '');
  if (!path || Object.values(TAB_ROUTES).includes(`/${path}`)) return null;
  try {
    const username = decodeURIComponent(path);
    return /^[A-Za-z0-9._]+$/.test(username) ? username : null;
  } catch { return null; }
}
const profilePath = (username: string) => `/${encodeURIComponent(username)}`;
const isSurfaceFilter = (value: string | null): value is SurfaceFilter => ['all', 'needs_surface', 'collected', 'collection_failed', 'deleted_account', 'issues', 'ignored'].includes(value || '');
const isDateValue = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
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
const hasReelCount = (profile: Profile) => numericPostCount(profile.reels_count) != null;
const needsReelCount = (profile: Profile) => !hasReelCount(profile) || profile.reels_count_status === 'Incomplete';
function joinedDateRange(profile: Profile): { from: string; to: string } | null {
  const value = String(profile.date_joined || '').trim();
  if (!value) return null;
  const monthYear = value.match(/^([A-Za-z]+)\s+((?:19|20)\d{2})$/);
  if (monthYear) {
    const month = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(monthYear[1].toLocaleLowerCase());
    if (month < 0) return null;
    const year = Number(monthYear[2]);
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(Date.UTC(year, month + 1, 0)).getUTCDate()).padStart(2, '0')}`;
    return { from, to };
  }
  const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (isoDate) return { from: isoDate[1], to: isoDate[1] };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const date = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  return { from: date, to: date };
}
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
  const [tab, setTab] = useState<Tab>(() => tabFromPath(window.location.pathname));
  const [profileUsername, setProfileUsername] = useState<string | null>(() => profileFromPath(window.location.pathname));
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>(() => {
    const value = new URLSearchParams(window.location.search).get('status');
    return isSurfaceFilter(value) ? value : 'all';
  });
  const [surfaceCountry, setSurfaceCountry] = useState(() => new URLSearchParams(window.location.search).get('country') || 'all');
  const [joinedFrom, setJoinedFrom] = useState(() => { const value = new URLSearchParams(window.location.search).get('from'); return isDateValue(value) ? value : ''; });
  const [joinedTo, setJoinedTo] = useState(() => { const value = new URLSearchParams(window.location.search).get('to'); return isDateValue(value) ? value : ''; });
  const [postSort, setPostSort] = useState<'none' | 'asc' | 'desc'>(() => {
    const value = new URLSearchParams(window.location.search).get('posts');
    return value === 'asc' || value === 'desc' ? value : 'none';
  });
  const [surfaceSelection, setSurfaceSelection] = useState<Set<string>>(new Set());
  const [deepSelection, setDeepSelection] = useState<Set<string>>(new Set());
  const [postCountSelection, setPostCountSelection] = useState<Set<string>>(new Set());
  const [postCountFilter, setPostCountFilter] = useState<'missing' | 'all'>(() => new URLSearchParams(window.location.search).get('post-counts') === 'all' ? 'all' : 'missing');
  const [reelCountSelection, setReelCountSelection] = useState<Set<string>>(new Set());
  const [reelCountFilter, setReelCountFilter] = useState<'missing' | 'all'>(() => new URLSearchParams(window.location.search).get('reel-counts') === 'all' ? 'all' : 'missing');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const next = await api<Data>('/state');
      setData(next);
      const missingKeys = new Set(next.profiles.filter((profile) => !hasPostCount(profile) && !profile.ignored).map(key));
      setPostCountSelection((current) => new Set([...current].filter((profileKey) => missingKeys.has(profileKey))));
      const validReelKeys = new Set(next.profiles.filter((profile) => !profile.ignored).map(key));
      setReelCountSelection((current) => new Set([...current].filter((profileKey) => validReelKeys.has(profileKey))));
      setError('');
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load account data.'); }
  }, []);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 2500); return () => window.clearInterval(timer); }, [refresh]);
  useEffect(() => {
    const syncFromUrl = () => {
      setTab(tabFromPath(window.location.pathname));
      setProfileUsername(profileFromPath(window.location.pathname));
      const params = new URLSearchParams(window.location.search);
      setSearch(params.get('q') || '');
      const status = params.get('status');
      setSurfaceFilter(isSurfaceFilter(status) ? status : 'all');
      setSurfaceCountry(params.get('country') || 'all');
      const from = params.get('from');
      const to = params.get('to');
      setJoinedFrom(isDateValue(from) ? from : '');
      setJoinedTo(isDateValue(to) ? to : '');
      const posts = params.get('posts');
      setPostSort(posts === 'asc' || posts === 'desc' ? posts : 'none');
      setPostCountFilter(params.get('post-counts') === 'all' ? 'all' : 'missing');
      setReelCountFilter(params.get('reel-counts') === 'all' ? 'all' : 'missing');
    };
    const currentTab = tabFromPath(window.location.pathname);
    if (!profileFromPath(window.location.pathname) && window.location.pathname !== TAB_ROUTES[currentTab]) window.history.replaceState(null, '', `${TAB_ROUTES[currentTab]}${window.location.search}`);
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.pathname = profileUsername ? profilePath(profileUsername) : TAB_ROUTES[tab];
    url.search = '';
    const params = url.searchParams;
    if (!profileUsername) {
      if (search) params.set('q', search);
      if (surfaceFilter !== 'all') params.set('status', surfaceFilter);
      if (surfaceCountry !== 'all') params.set('country', surfaceCountry);
      if (joinedFrom) params.set('from', joinedFrom);
      if (joinedTo) params.set('to', joinedTo);
      if (postSort !== 'none') params.set('posts', postSort);
      if (postCountFilter !== 'missing') params.set('post-counts', postCountFilter);
      if (reelCountFilter !== 'missing') params.set('reel-counts', reelCountFilter);
    }
    const nextUrl = `${url.pathname}${url.search}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) window.history.replaceState({ tab }, '', nextUrl);
  }, [tab, profileUsername, search, surfaceFilter, surfaceCountry, joinedFrom, joinedTo, postSort, postCountFilter, reelCountFilter]);

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
  const reelCountProfiles = visibleProfiles.filter((profile) => !profile.ignored && (reelCountFilter === 'all' || needsReelCount(profile)));
  const surfaceBaseProfiles = visibleProfiles.filter((profile) => Boolean(profile.last_fetched_at));
  const surfaceCountries = [...new Set(surfaceBaseProfiles.map((profile) => String(profile.country || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const surfaceProfiles = surfaceBaseProfiles
    .filter((profile) => surfaceCountry === 'all' || String(profile.country || '').trim() === surfaceCountry)
    .filter((profile) => {
      if (!joinedFrom && !joinedTo) return true;
      const joined = joinedDateRange(profile);
      return Boolean(joined && (!joinedFrom || joined.to >= joinedFrom) && (!joinedTo || joined.from <= joinedTo));
    })
    .map((profile, index) => ({ profile, index, posts: postCount(profile) }))
    .sort((a, b) => {
      if (postSort === 'none') return a.index - b.index;
      if (a.posts == null) return b.posts == null ? a.index - b.index : 1;
      if (b.posts == null) return -1;
      return (postSort === 'asc' ? a.posts - b.posts : b.posts - a.posts) || a.index - b.index;
    })
    .map(({ profile }) => profile);
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
  function navigateTab(nextTab: Tab) {
    setTab(nextTab);
    setProfileUsername(null);
    const path = TAB_ROUTES[nextTab];
    if (window.location.pathname !== path) window.history.pushState({ tab: nextTab }, '', path);
  }
  async function startJob(kind: Job['kind'], selected: Set<string>) {
    setBusy(true); setError('');
    try {
      await api('/jobs', { method: 'POST', body: JSON.stringify({ kind, profile_keys: [...selected] }) });
      if (kind === 'surface') setSurfaceSelection(new Set());
      else if (kind === 'deep') setDeepSelection(new Set());
      else if (kind === 'post_count') setPostCountSelection(new Set());
      else if (kind === 'reels_count') setReelCountSelection(new Set());
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
    { id: 'reel_counts', label: 'Reel counts', count: profiles.filter((p) => !p.ignored && needsReelCount(p)).length },
    { id: 'deep', label: 'Deep analysis', count: profiles.filter((p) => p.deep_status === 'Collected').length },
    { id: 'issues', label: 'Issues', count: issues.length }
  ];

  const selectedProfile = profileUsername ? profiles.find((profile) => key(profile) === profileUsername.toLocaleLowerCase()) : undefined;
  const selectedProfileJobs = [data?.workflow?.active_job, ...(data?.workflow?.recent_jobs || [])]
    .filter((job): job is Job => Boolean(job && selectedProfile && job.profile_keys.some((username) => username.toLocaleLowerCase() === key(selectedProfile))));

  return <main className={`shell${profileUsername ? ' profile-shell' : ''}`}>
    <header className="topbar"><a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigateTab('master'); }} aria-label="dedgram home"><span className="brand-mark">d</span><span>dedgram <small>PROFILE ANALYSIS</small></span></a><div className="connection"><span className="connection-icon" aria-hidden="true">{activeJob ? <Activity /> : <Database />}</span>{activeJob ? 'JOB RUNNING' : 'LOCAL DATA CONNECTED'}</div></header>
    {!profileUsername && <section className="intro"><div><p className="eyebrow">PRIVATE WORKSPACE / LOCAL ONLY</p><h1>Bot profiles</h1><p className="lede">Browse the phone catalog, collect profile details, and inspect post dates.</p></div><div className="metric"><strong>{profiles.length}</strong><span>PROFILES</span></div></section>}
    {error && <div className="alert" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="Dismiss"><X aria-hidden="true" /></button></div>}
    {!profileUsername && activeJob && <section className="job-card"><div className="job-title"><div><span className="eyebrow">COLLECTION IN PROGRESS</span><h2>{activeJob.kind === 'surface' ? 'Surface analysis' : activeJob.kind === 'post_count' ? 'Post count refresh' : activeJob.kind === 'reels_count' ? 'Reel count scan' : activeJob.kind === 'post_content' ? 'Post details scan' : activeJob.kind === 'reel_content' ? 'Reel details scan' : 'Deep analysis'}</h2></div><button className="button secondary" disabled={busy} onClick={() => void cancelJob()}>Stop</button></div><div className="progress-track"><span style={{ width: `${Math.max(4, (doneCount / activeJob.profile_keys.length) * 100)}%` }} /></div><p className="muted">{doneCount} of {activeJob.profile_keys.length} profiles complete{activeJob.kind === 'deep' ? ` · ${activeJob.post_index} post dates in progress` : ''}</p>{activeJob.kind === 'reels_count' && activeJob.index < activeJob.profile_keys.length && <p className="collector-wait">Scanning @{activeJob.profile_keys[activeJob.index]} · profiles with many reels may take a while.</p>}{!activeJob.last_activity_at && <p className="collector-wait">Waiting for the Firefox add-on. Load it in Firefox and stay signed in to Instagram.</p>}</section>}
    {!profileUsername && <nav className="tabs" aria-label="Profile views">{tabs.map((item) => <button key={item.id} className={`tab ${tab === item.id ? 'active' : ''}`} onClick={() => navigateTab(item.id)}><span>{item.label}</span><b>{item.count}</b></button>)}</nav>}
    {!data ? <section className="empty">Connecting to the local account data…</section> : profileUsername ? (selectedProfile ? <ProfileDetail profile={selectedProfile} issues={issues.filter((issue) => issue.username?.toLocaleLowerCase() === key(selectedProfile))} jobs={selectedProfileJobs} activeJob={activeJob} busy={busy} onRun={(kind) => void startJob(kind, new Set([key(selectedProfile)]))} onCancel={() => void cancelJob()} onBack={() => navigateTab('master')} /> : <section className="empty profile-not-found"><h3>Profile not found</h3><p>No local profile data exists for @{profileUsername}.</p><button className="button secondary" onClick={() => navigateTab('master')}>Back to profiles</button></section>) : <>
      {tab === 'master' && <section>
        <div className="toolbar"><label className="search"><Search className="ui-icon search-icon" size={17} strokeWidth={1.8} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search username, bio, or country" /></label><label className="filter-select"><ListFilter className="ui-icon filter-icon" size={16} strokeWidth={1.8} aria-hidden="true" /><span className="sr-only">Filter profiles by surface status</span><select value={surfaceFilter} onChange={(event) => setSurfaceFilter(event.target.value as SurfaceFilter)} aria-label="Filter profiles by surface status"><option value="all">All profiles</option><option value="needs_surface">Needs surface analysis</option><option value="collected">Surface complete</option><option value="collection_failed">Collection failed</option><option value="deleted_account">Deleted account</option><option value="issues">Has issues</option><option value="ignored">Ignored</option></select></label><button className="button secondary" onClick={() => selectVisible(surfaceSelection, setSurfaceSelection, masterProfiles.filter((profile) => !profile.ignored))}>{masterProfiles.some((profile) => !profile.ignored) && masterProfiles.filter((profile) => !profile.ignored).every((profile) => surfaceSelection.has(key(profile))) ? 'Clear visible' : 'Select visible'}</button></div>
        <div className="selection-bar"><span><strong>{masterProfiles.length}</strong> visible <span className="count-separator" aria-hidden="true">·</span> <strong>{surfaceSelection.size}</strong> selected for surface analysis</span><button className="button primary" disabled={!surfaceSelection.size || busy || Boolean(activeJob)} onClick={() => void startJob('surface', surfaceSelection)}>Run surface analysis <ArrowRight className="ui-icon button-icon" size={15} strokeWidth={1.8} aria-hidden="true" /></button></div>
        <ProfileTable profiles={masterProfiles} mode="master" selection={surfaceSelection} onToggle={(username) => toggle(surfaceSelection, setSurfaceSelection, username)} onIgnore={(username, ignored) => void setIgnored(username, ignored)} />
        {!masterProfiles.length && <div className="empty">No profiles match the current search and status filter.</div>}
      </section>}
      {tab === 'surface' && <section>
        <div className="toolbar surface-toolbar">
          <label className="search"><Search className="ui-icon search-icon" size={17} strokeWidth={1.8} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a profile" /></label>
          <label className="filter-select"><Globe2 className="ui-icon filter-icon" size={16} strokeWidth={1.8} aria-hidden="true" /><span className="sr-only">Filter by country</span><select value={surfaceCountry} onChange={(event) => setSurfaceCountry(event.target.value)} aria-label="Filter by country"><option value="all">All countries</option>{surfaceCountries.map((country) => <option key={country} value={country}>{country}</option>)}</select></label>
          <label className="date-filter"><span>Joined from</span><input type="date" value={joinedFrom} max={joinedTo || undefined} onChange={(event) => setJoinedFrom(event.target.value)} /></label>
          <label className="date-filter"><span>Joined to</span><input type="date" value={joinedTo} min={joinedFrom || undefined} onChange={(event) => setJoinedTo(event.target.value)} /></label>
          <label className="filter-select"><ListFilter className="ui-icon filter-icon" size={16} strokeWidth={1.8} aria-hidden="true" /><span className="sr-only">Sort by post count</span><select value={postSort} onChange={(event) => setPostSort(event.target.value as 'none' | 'asc' | 'desc')} aria-label="Sort by post count"><option value="none">Default order</option><option value="desc">Posts: high to low</option><option value="asc">Posts: low to high</option></select></label>
        </div>
        <div className="selection-bar"><span><strong>{surfaceProfiles.length}</strong> visible · <strong>{deepSelection.size}</strong> selected · {readyForDeep.length} ready for deep analysis</span><button className="button primary" disabled={!deepSelection.size || busy || Boolean(activeJob)} onClick={() => void startJob('deep', deepSelection)}>Run deep analysis <ArrowRight className="ui-icon button-icon" size={15} strokeWidth={1.8} aria-hidden="true" /></button></div>
        <ProfileTable profiles={surfaceProfiles} mode="surface" selection={deepSelection} onToggle={(username) => toggle(deepSelection, setDeepSelection, username)} />
      </section>}
      {tab === 'insights' && <InsightsView profiles={profiles} />}
      {tab === 'post_counts' && <section>
        <div className="toolbar"><label className="search"><Search className="ui-icon search-icon" size={17} strokeWidth={1.8} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search username or bio" /></label><label className="filter-select"><ListFilter className="ui-icon filter-icon" size={16} strokeWidth={1.8} aria-hidden="true" /><select value={postCountFilter} onChange={(event) => setPostCountFilter(event.target.value as 'missing' | 'all')} aria-label="Filter by post count"><option value="missing">Missing post count</option><option value="all">All profiles</option></select></label><button className="button secondary" disabled={!postCountSelectable.length} onClick={() => selectVisible(postCountSelection, setPostCountSelection, postCountSelectable)}>{postCountSelectable.length > 0 && postCountSelectable.every((profile) => postCountSelection.has(key(profile))) ? 'Clear visible' : 'Select visible'}</button></div>
        <div className="selection-bar"><span><strong>{postCountProfiles.length}</strong> visible <span className="count-separator" aria-hidden="true">·</span> <strong>{postCountSelection.size}</strong> selected for post count refresh</span><button className="button primary" disabled={!postCountSelection.size || busy || Boolean(activeJob)} onClick={() => void startJob('post_count', postCountSelection)}>Fetch post counts <ArrowRight className="ui-icon button-icon" size={15} strokeWidth={1.8} aria-hidden="true" /></button></div>
        <p className="helper post-count-help">On success, this updates only <code>posts_count</code>. Failed attempts are recorded in Issues; other surface fields and post-date data stay untouched.</p>
        <PostCountTable profiles={postCountProfiles} selection={postCountSelection} onToggle={(username) => toggle(postCountSelection, setPostCountSelection, username)} />
      </section>}
      {tab === 'reel_counts' && <section>
        <div className="toolbar"><label className="search"><Search className="ui-icon search-icon" size={17} strokeWidth={1.8} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search username or bio" /></label><label className="filter-select"><ListFilter className="ui-icon filter-icon" size={16} strokeWidth={1.8} aria-hidden="true" /><select value={reelCountFilter} onChange={(event) => setReelCountFilter(event.target.value as 'missing' | 'all')} aria-label="Filter reel counts"><option value="missing">Missing reel count</option><option value="all">All profiles</option></select></label><button className="button secondary" disabled={!reelCountProfiles.length} onClick={() => selectVisible(reelCountSelection, setReelCountSelection, reelCountProfiles)}>{reelCountProfiles.length > 0 && reelCountProfiles.every((profile) => reelCountSelection.has(key(profile))) ? 'Clear visible' : 'Select visible'}</button></div>
        <div className="selection-bar"><span><strong>{reelCountProfiles.length}</strong> visible · <strong>{reelCountSelection.size}</strong> selected for reel count scan</span><button className="button primary" disabled={!reelCountSelection.size || busy || Boolean(activeJob)} onClick={() => void startJob('reels_count', reelCountSelection)}>Fetch reel counts <ArrowRight className="ui-icon button-icon" size={15} strokeWidth={1.8} aria-hidden="true" /></button></div>
        <p className="helper post-count-help">The add-on scrolls the Reels tab and counts unique reel links. If it can’t confirm the end, it records an issue and doesn’t save the partial count. Existing counts can be rescanned from “All profiles.”</p>
        <ReelCountTable profiles={reelCountProfiles} selection={reelCountSelection} onToggle={(username) => toggle(reelCountSelection, setReelCountSelection, username)} />
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

function ProfileDetail({ profile, issues, jobs, activeJob, busy, onRun, onCancel, onBack }: { profile: Profile; issues: Issue[]; jobs: Job[]; activeJob: Job | null; busy: boolean; onRun: (kind: 'post_content' | 'reel_content') => void; onCancel: () => void; onBack: () => void }) {
  const dates = profile.post_dates || [];
  const profileJob = activeJob?.profile_keys.some((username) => username.toLocaleLowerCase() === key(profile)) ? activeJob : null;
  return <section className="profile-detail">
    <button className="profile-back" onClick={onBack}><ArrowRight className="ui-icon back-arrow" size={16} aria-hidden="true" /> All profiles</button>
    <div className="profile-heading">
      <div className="profile-avatar">{profile.username.slice(0, 1).toLocaleUpperCase()}</div>
      <div className="profile-heading-main">
        <div className="profile-title-row"><h1>{profile.username}</h1><Status value={profile.status || 'Pending'} /><a className="button secondary profile-instagram-link" href={profile.url} target="_blank" rel="noreferrer">Instagram <ArrowUpRight className="ui-icon" size={15} aria-hidden="true" /></a></div>
        <div className="profile-counts"><div><strong>{text(profile.posts_count)}</strong><span>posts</span></div><div><strong>{text(profile.reels_count)}</strong><span>reels</span></div><div><strong>{dates.length.toLocaleString()}</strong><span>post dates</span></div></div>
        <div className="profile-bio"><strong>@{profile.username}</strong><p>{profile.bio || 'No bio collected.'}</p></div>
        <div className="profile-content-actions"><button className="button primary" disabled={busy || Boolean(activeJob)} onClick={() => onRun('post_content')}>Scan post details <ArrowRight className="ui-icon button-icon" size={15} aria-hidden="true" /></button><button className="button secondary" disabled={busy || Boolean(activeJob)} onClick={() => onRun('reel_content')}>Scan reel details <ArrowRight className="ui-icon button-icon" size={15} aria-hidden="true" /></button></div>
      </div>
    </div>
    {profileJob && <section className="profile-content-progress"><div><strong>{profileJob.kind === 'post_content' ? 'Post details scan' : profileJob.kind === 'reel_content' ? 'Reel details scan' : profileJob.kind.replace('_', ' ')}</strong><span>{profileJob.stage === 'content_item' ? `${profileJob.content_index || 0} / ${profileJob.content_urls?.length || 0} items` : 'Reading the profile content list…'}</span></div><button className="button secondary" disabled={busy} onClick={onCancel}>Stop scan</button></section>}

    <div className="profile-metadata">
      <ProfileField label="Profile URL" value={profile.url} />
      <ProfileField label="Country" value={profile.country} />
      <ProfileField label="Date joined" value={profile.date_joined} />
      <ProfileField label="Added at" value={fmt(profile.added_at)} />
      <ProfileField label="Catalog first seen" value={fmt(profile.catalog_first_seen_at)} />
      <ProfileField label="Last fetched" value={fmt(profile.last_fetched_at)} />
      <ProfileField label="Deep analysis" value={profile.deep_status || 'Not collected'} />
      <ProfileField label="Reel scan" value={profile.reels_count_status || 'Not collected'} />
      <ProfileField label="Reel count last attempted" value={fmt(profile.reels_count_last_attempt_at)} />
      <ProfileField label="Ignored" value={profile.ignored ? 'Yes' : 'No'} />
    </div>
    {profile.last_error && <div className="profile-error"><strong>Last error</strong><p>{profile.last_error}</p></div>}

    <section className="profile-issues"><h2>Collection issues <span>{issues.length}</span></h2>{issues.length ? <div className="profile-issue-list">{issues.map((issue, index) => <article key={issue.id || `${issue.occurred_at}-${index}`}><div><strong>{text(issue.code)}</strong><span>{fmt(issue.occurred_at)}</span></div><p>{text(issue.message)}</p>{issue.recommended_action && <small>{issue.recommended_action}</small>}{issue.post_url && <a href={issue.post_url} target="_blank" rel="noreferrer">Open affected post <ArrowUpRight className="ui-icon" size={13} aria-hidden="true" /></a>}<details className="profile-issue-raw"><summary>Full issue record</summary><pre>{JSON.stringify(issue, null, 2)}</pre></details></article>)}</div> : <p className="profile-no-issues">No collection issues recorded for this profile.</p>}</section>

    <section className="profile-job-history"><h2>Analysis history <span>{jobs.length}</span></h2>{jobs.length ? <div>{jobs.map((job) => <details key={job.id}><summary><strong>{job.kind.replace('_', ' ')} · {job.status}</strong><span>{fmt(job.started_at)}{job.completed_at ? ` – ${fmt(job.completed_at)}` : ''}</span></summary><pre>{JSON.stringify(job, null, 2)}</pre></details>)}</div> : <p className="profile-no-issues">No retained analysis jobs reference this profile.</p>}</section>

    <div className="profile-text-panels">
      <details><summary>Collected profile text</summary><pre>{profile.profile_text || 'No profile text collected.'}</pre></details>
      <details><summary>About text</summary><pre>{profile.about_text || 'No about text collected.'}</pre></details>
    </div>

    <details className="profile-raw-record"><summary>Complete stored profile record</summary><pre>{JSON.stringify(profile, null, 2)}</pre></details>

    <div className="profile-posts-heading"><h2>Existing deep-analysis dates</h2><span>{dates.length.toLocaleString()} records</span></div>
    <p className="profile-date-note">This is the original deep-analysis date list. Use the separate post and reel sections below for categorized records and engagement metrics.</p>
    {dates.length ? <div className="profile-post-grid">{dates.map((post, index) => <a className="profile-post-tile" href={post.url} target="_blank" rel="noreferrer" key={`${post.url}-${index}`}><span>POST {String(index + 1).padStart(2, '0')}</span><strong>{post.date || 'Date unavailable'}</strong><ArrowUpRight className="ui-icon" size={15} aria-hidden="true" /></a>)}</div> : <div className="empty profile-post-empty"><h3>No post dates collected</h3><p>Run deep analysis on this profile to collect post dates.</p></div>}
    <ContentRecordsSection title="Post dates and engagement" records={profile.post_records || []} status={profile.posts_data_status} lastFetched={profile.posts_data_last_fetched_at} kind="post" />
    <ContentRecordsSection title="Reel dates and engagement" records={profile.reel_records || []} status={profile.reels_data_status} lastFetched={profile.reels_data_last_fetched_at} kind="reel" />
  </section>;
}

function ProfileField({ label, value }: { label: string; value?: string | number | null }) {
  return <div className="profile-field"><span>{label}</span><strong>{text(value)}</strong></div>;
}

function ContentRecordsSection({ title, records, status, lastFetched, kind }: { title: string; records: ContentRecord[]; status?: string; lastFetched?: string; kind: 'post' | 'reel' }) {
  return <section className="content-record-section">
    <header><div><h2>{title}</h2><span>{records.length.toLocaleString()} collected · {status || 'Not scanned'}</span></div><span>Last fetch {fmt(lastFetched)}</span></header>
    {records.length ? <div className="content-record-grid">{records.map((record) => <article className="content-record" key={record.url}>
      <div className="content-record-title"><span>{kind.toUpperCase()}</span><Status value={record.fetch_status || 'Incomplete'} /></div>
      <a className="content-record-date" href={record.url} target="_blank" rel="noreferrer">{fmt(record.date)} <ArrowUpRight className="ui-icon" size={14} aria-hidden="true" /></a>
      <div className="content-metrics"><div><strong>{text(record.views_count)}</strong><span>views</span></div><div><strong>{text(record.likes_count)}</strong><span>likes</span></div><div><strong>{text(record.comments_count)}</strong><span>comments</span></div></div>
      <p>Fetched {fmt(record.last_fetched_at)}</p>
      {record.fetch_errors?.length ? <ul className="content-record-errors">{record.fetch_errors.map((error, index) => <li key={`${error.field}-${index}`}><strong>{error.field.replace('_', ' ')}</strong>: {error.message}</li>)}</ul> : null}
      <details><summary>Full item record</summary><pre>{JSON.stringify(record, null, 2)}</pre></details>
    </article>)}</div> : <div className="empty profile-post-empty"><h3>No {kind} details collected</h3><p>Run the {kind} details scan to save dates and engagement counts here.</p></div>}
  </section>;
}

function ProfileTable({ profiles, mode, selection, onToggle, onIgnore }: { profiles: Profile[]; mode: 'master' | 'surface' | 'deep'; selection: Set<string>; onToggle: (username: string) => void; onIgnore?: (username: string, ignored: boolean) => void }) {
  if (!profiles.length) return <div className="empty">{mode === 'surface' ? 'No surface results match the current search and filters.' : mode === 'deep' ? 'No post date records yet.' : 'No profiles in the catalog.'}</div>;
  return <div className="table-wrap"><table><thead><tr>{mode !== 'deep' && <th className="check-col"><span className="sr-only">Select</span></th>}<th>PROFILE</th>{mode === 'master' && <><th>PHONE CATALOG ADDED</th><th>SURFACE STATUS</th><th>REVIEW</th></>}{mode === 'surface' && <><th>BIO / PROFILE TEXT / ABOUT TEXT</th><th>COUNTRY</th><th>DATE JOINED</th><th>POSTS</th><th>REELS</th><th>STATUS</th><th>ADDED AT</th><th>LAST FETCHED</th><th>LAST ERROR</th></>}{mode === 'deep' && <><th>POST DATES</th><th>STATUS</th><th>LAST FETCHED</th></>}</tr></thead><tbody>{profiles.map((profile) => <tr key={key(profile)}>
    {mode !== 'deep' && <td><input aria-label={`Select @${profile.username}`} type="checkbox" checked={selection.has(key(profile))} disabled={profile.ignored || (mode === 'surface' && !successful(profile))} onChange={() => onToggle(key(profile))} /></td>}
    <td><div className="profile-cell"><span className="avatar">{profile.username.slice(0, 1).toLocaleUpperCase()}</span><div><a className="username" href={profilePath(profile.username)}>@{profile.username}<ArrowUpRight className="ui-icon link-icon" aria-hidden="true" /></a><small>{profile.url}</small></div></div></td>
    {mode === 'master' && <><td>{fmt(profile.added_at)}</td><td><Status value={profile.ignored ? 'Ignored' : profile.last_fetched_at ? profile.status || 'Fetched' : 'Pending'} /></td><td><button className="link-button" onClick={() => onIgnore?.(profile.username, !profile.ignored)}>{profile.ignored ? 'Restore' : 'Ignore'}</button></td></>}
    {mode === 'surface' && <><td className="bio-cell"><details><summary>{text(profile.bio).slice(0, 70)}{String(profile.bio || '').length > 70 ? '…' : ''}</summary><pre>{text(profile.bio)}{'\n\nProfile text\n'}{text(profile.profile_text)}{'\n\nAbout text\n'}{text(profile.about_text)}</pre></details></td><td>{text(profile.country)}</td><td>{text(profile.date_joined)}</td><td>{text(profile.posts_count)}</td><td>{text(profile.reels_count)}</td><td><Status value={profile.status} /></td><td>{fmt(profile.added_at)}</td><td>{fmt(profile.last_fetched_at)}</td><td className="error-text">{text(profile.last_error)}</td></>}
    {mode === 'deep' && <><td><details><summary>{profile.post_dates?.length || 0} dates collected</summary><ul className="post-list">{(profile.post_dates || []).map((post) => <li key={post.url}><a href={post.url} target="_blank" rel="noreferrer">{post.date || 'Date unavailable'} <ArrowUpRight className="ui-icon link-icon" aria-hidden="true" /></a></li>)}</ul></details></td><td><Status value={profile.deep_status || 'Pending'} /></td><td>{fmt(profile.last_fetched_at)}</td></>}
  </tr>)}</tbody></table></div>;
}

function PostCountTable({ profiles, selection, onToggle }: { profiles: Profile[]; selection: Set<string>; onToggle: (username: string) => void }) {
  if (!profiles.length) return <div className="empty"><h3>No matching profiles</h3><p>Profiles with missing post counts will appear here.</p></div>;
  return <div className="table-wrap"><table className="post-count-table"><thead><tr><th className="check-col"><span className="sr-only">Select</span></th><th>PROFILE</th><th>POST COUNT</th><th>SURFACE STATUS</th><th>LAST FETCHED</th></tr></thead><tbody>{profiles.map((profile) => <tr key={key(profile)}><td><input aria-label={`Select @${profile.username} for post count refresh`} type="checkbox" checked={selection.has(key(profile))} disabled={hasPostCount(profile)} onChange={() => onToggle(key(profile))} /></td><td><div className="profile-cell"><span className="avatar">{profile.username.slice(0, 1).toLocaleUpperCase()}</span><div><a className="username" href={profilePath(profile.username)}>@{profile.username}<ArrowUpRight className="ui-icon link-icon" aria-hidden="true" /></a><small>{profile.url}</small></div></div></td><td><span className={hasPostCount(profile) ? '' : 'missing-post-count'}>{text(profile.posts_count)}</span></td><td><Status value={profile.status || 'Not analyzed'} /></td><td>{fmt(profile.last_fetched_at)}</td></tr>)}</tbody></table></div>;
}

function ReelCountTable({ profiles, selection, onToggle }: { profiles: Profile[]; selection: Set<string>; onToggle: (username: string) => void }) {
  if (!profiles.length) return <div className="empty"><h3>No matching profiles</h3><p>Profiles without a saved reel count will appear here.</p></div>;
  return <div className="table-wrap"><table className="reel-count-table"><thead><tr><th className="check-col"><span className="sr-only">Select</span></th><th>PROFILE</th><th>REEL COUNT</th><th>SCAN STATUS</th><th>LAST ATTEMPT</th></tr></thead><tbody>{profiles.map((profile) => <tr key={key(profile)}><td><input aria-label={`Select @${profile.username} for reel count scan`} type="checkbox" checked={selection.has(key(profile))} onChange={() => onToggle(key(profile))} /></td><td><div className="profile-cell"><span className="avatar">{profile.username.slice(0, 1).toLocaleUpperCase()}</span><div><a className="username" href={profilePath(profile.username)}>@{profile.username}<ArrowUpRight className="ui-icon link-icon" aria-hidden="true" /></a><small>{profile.url}</small></div></div></td><td><span className={hasReelCount(profile) ? '' : 'missing-post-count'}>{hasReelCount(profile) ? text(profile.reels_count) : 'Not collected'}</span></td><td><Status value={profile.reels_count_status || 'Pending'} /></td><td>{fmt(profile.reels_count_last_attempt_at)}</td></tr>)}</tbody></table></div>;
}

function Status({ value }: { value?: string }) {
  const lower = String(value || 'Pending').toLocaleLowerCase();
  const type = lower.includes('incomplete') || lower.includes('fail') || lower.includes('deleted') || lower.includes('error') ? 'bad' : lower.includes('collect') || lower === 'complete' ? 'good' : 'pending';
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
          {repeatedBios.length ? <div className="repeated-bios">{repeatedBios.map((group) => <article className="repeated-bio" key={group.bio.toLocaleLowerCase()}><div className="repeat-count">{group.profiles.length}<small>accounts</small></div><div className="repeat-copy"><p>{group.bio}</p><div className="repeat-profiles">{group.profiles.slice(0, 8).map((profile) => <a key={key(profile)} href={profilePath(profile.username)}>@{profile.username}</a>)}{group.profiles.length > 8 && <span>+{group.profiles.length - 8} more</span>}</div></div></article>)}</div> : <div className="no-repeats"><span>Each non-empty bio is unique across these scanned profiles.</span><strong>{bioGroups.size.toLocaleString()} distinct bios</strong></div>}
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
