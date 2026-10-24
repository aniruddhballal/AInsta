# deadgram atlas public preview

A static, self-contained Vercel site. It lists every username in the bot profile index, publishes a detailed page for `edlt.shox`, and labels the other profiles as in progress. No Instagram login, collector process, database, or server function is needed to serve it.

## Deploy on Vercel

Import this repository as a Vercel project and set **Root Directory** to `profile-showcase`. The included `vercel.json` runs `npm run build` and serves `dist`. No environment variables are required. The deployment provides `/` and `/profiles/edlt.shox/`.

The committed `snapshot/` directory is the complete input for the Vercel build. The site serves the original profile, discovery, item, and run JSON files, CSV exports, and HTML collector report under `/downloads/edlt.shox/`. It also includes local copies of available profile and reel thumbnails so signed Instagram image URLs do not determine whether the site renders.

## Update the snapshot

From this folder, run:

```powershell
npm run refresh
```

`sync` copies the current catalog and `edlt.shox` collector output from the parent repository into `snapshot/`, then refreshes thumbnails. `build` generates the static `dist/` site solely from `snapshot/`. Commit the refreshed snapshot to publish a new version. For a local preview, serve `dist` with any static file server, for example `npx serve dist`.

Only `edlt.shox` has a public detail page in this preview. Adding another profile requires extending the build script and checking its saved data before publishing it.
