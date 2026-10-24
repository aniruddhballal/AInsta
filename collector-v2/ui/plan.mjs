export const MODES = Object.freeze({
  profile_header: 'Profile details and post count',
  reel_grid: 'Reel URLs and count',
  reel_details: 'Reel details',
  profile_only: 'Profile details only',
  depth_first: 'Profile + reels, one account at a time',
  breadth_first: 'All profiles, then all reels',
  reels_only: 'Reels for saved profiles'
});

export const ORDERS = Object.freeze({
  selection: 'Selection order',
  posts_ascending: 'Fewest posts first',
  reels_ascending: 'Fewest reels first'
});

export function orderProfiles(profiles, order = 'selection', counts = new Map()) {
  if (!Object.hasOwn(ORDERS, order)) throw new Error('Choose a valid profile order.');
  if (order === 'selection') return [...profiles];
  return profiles.map((username, index) => ({ username, index, count: counts.get(username) }))
    .sort((a, b) => {
      const aKnown = Number.isSafeInteger(a.count) && a.count >= 0;
      const bKnown = Number.isSafeInteger(b.count) && b.count >= 0;
      if (aKnown !== bKnown) return aKnown ? -1 : 1;
      return (aKnown ? a.count - b.count : 0) || a.index - b.index;
    }).map(({ username }) => username);
}

export const terminal = (status) => ['complete', 'needs_review', 'failed', 'skipped'].includes(status);

export function stepsFor(profiles, mode) {
  if (!Object.hasOwn(MODES, mode)) throw new Error('Choose a valid collection mode.');
  const step = (username, stage) => ({ username, stage });
  if (mode === 'profile_header') return profiles.map((username) => step(username, 'profile_header'));
  if (mode === 'reel_grid') return profiles.map((username) => step(username, 'reel_grid'));
  if (mode === 'reel_details') return profiles.map((username) => step(username, 'reels'));
  if (mode === 'profile_only') return profiles.map((username) => step(username, 'profile'));
  if (mode === 'reels_only') return profiles.map((username) => step(username, 'reels'));
  if (mode === 'breadth_first') return [
    ...profiles.map((username) => step(username, 'profile')),
    ...profiles.map((username) => step(username, 'reels'))
  ];
  return profiles.flatMap((username) => [step(username, 'profile'), step(username, 'reels')]);
}

export function resultStatus(stages) {
  const values = Object.values(stages);
  if (values.some((stage) => stage.status === 'running')) return 'running';
  if (values.some((stage) => stage.status === 'failed')) return 'failed';
  if (values.some((stage) => stage.status === 'needs_review')) return 'needs_review';
  if (values.some((stage) => stage.status === 'skipped')) return 'skipped';
  if (values.every((stage) => stage.status === 'complete')) return 'complete';
  return 'queued';
}
