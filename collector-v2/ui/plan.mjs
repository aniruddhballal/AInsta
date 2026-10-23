export const MODES = Object.freeze({
  profile_only: 'Profile details only',
  depth_first: 'Profile + reels, one account at a time',
  breadth_first: 'All profiles, then all reels',
  reels_only: 'Reels for saved profiles'
});

export const terminal = (status) => ['complete', 'needs_review', 'failed', 'skipped'].includes(status);

export function stepsFor(profiles, mode) {
  if (!Object.hasOwn(MODES, mode)) throw new Error('Choose a valid collection mode.');
  const step = (username, stage) => ({ username, stage });
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
