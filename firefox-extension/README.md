# dedgram Dashboard Collector

The Firefox add-on is the Instagram DOM adapter for the local web dashboard. It has no separate profile catalog and does not start profile scans on its own. It checks the dashboard's loopback API for an explicitly queued job; when no job is active, it leaves Instagram pages alone.

## Setup

1. Start the dashboard and API from `web-dashboard` with `npm install` followed by `npm run dev`.
2. Sign in to Instagram in Firefox.
3. Open `about:debugging#/runtime/this-firefox`.
4. Choose **Load Temporary Add-on...** and select this folder's `manifest.json`.
5. In the dedgram dashboard, select profiles for surface, post-count, reel-count, or deep analysis; for separate post/reel engagement scans, open a profile page and use its scan buttons.

The background script polls `http://127.0.0.1:4317` while idle. It navigates one reusable Instagram tab only after the dashboard has queued a profile. Results and collection issues are written by the API as separate JSON records under `bot-info/database/`.

## Analysis stages

- **Surface analysis** reads the profile header, displayed post count, bio, and About this account details. It does not scroll the post grid or visit posts.
- **Reel count scan** opens the profile's Reels tab, scrolls while accumulating unique reel links, and saves a count only after repeated end-of-list checks. If access fails or the list never settles, it preserves any prior count and records an issue.
- **Deep analysis** is available for profiles with completed surface results. It scrolls the profile grid to collect post URLs, visits each post, and saves its timestamp when Instagram exposes one.
- **Post details scan** and **Reel details scan** are separate profile-page actions. They independently scroll the profile posts grid or Reels tab and save date, likes, comments, views, and the latest fetch time in separate `post_records` and `reel_records` arrays. Reel scans capture views from the grid tiles and open each tile in Instagram's overlay to read its timestamp and engagement, keeping the collector on the same profile page. Fields Instagram does not expose are left flagged with Issues so the profile can be retried.
- Missing counts, account dates, post dates, inaccessible profiles, and collection errors appear in the dashboard's Issues tab and the JSON file.

The add-on uses Firefox Manifest V2. It reads the active logged-in page DOM and does not bypass Instagram login, checkpoints, consent, or rate limits.
