import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { catalog, detail, profileData, profileSummary, resolveUsername, root, summary, usernames } from './data.mjs';
import { paths, readJson, writeJson } from '../src/store.mjs';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), 'public');
const jobPath = join(root, 'data', 'ui-job.json');
const port = Number(process.env.COLLECTOR_UI_PORT || 5174);

const json = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
};

async function body(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32_768) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Expected a JSON request body.'); }
}

class BatchRunner {
  constructor() { this.batch = null; this.active = false; }

  async load() {
    this.batch = await readJson(jobPath);
    if (this.batch?.status === 'running') {
      this.batch.status = 'interrupted';
      this.batch.current = null;
      for (const username of this.batch.profiles) {
        if (this.batch.results[username]?.status === 'running') this.batch.results[username].status = 'interrupted';
      }
      await this.save();
    }
  }

  async save() { await writeJson(jobPath, this.batch); }

  async start(requested) {
    if (this.active) throw Object.assign(new Error('A batch is already running.'), { status: 409 });
    if (!Array.isArray(requested) || !requested.length) throw Object.assign(new Error('Select at least one profile.'), { status: 400 });
    const valid = await usernames();
    const lookup = new Map(valid.map((name) => [name.toLowerCase(), name]));
    const selected = [...new Set(requested.map((name) => typeof name === 'string' ? lookup.get(name.toLowerCase()) : null))];
    if (selected.includes(undefined) || selected.includes(null) || selected.length > valid.length) {
      throw Object.assign(new Error('Selection contains a profile outside the catalog.'), { status: 400 });
    }
    const time = new Date().toISOString();
    this.batch = { id: randomUUID(), status: 'running', profiles: selected,
      results: Object.fromEntries(selected.map((name) => [name, { status: 'queued', started_at: null, finished_at: null, error: null }])),
      current: null, started_at: time, updated_at: time, finished_at: null, stop_requested: false, logs: [] };
    await this.save();
    this.active = true;
    void this.run().catch(async (error) => {
      this.batch.status = 'failed';
      this.batch.error = error.message;
      this.batch.updated_at = new Date().toISOString();
      this.active = false;
      await this.save().catch(() => {});
    });
    return this.batch;
  }

  async stop() {
    if (!this.active) throw Object.assign(new Error('No batch is running.'), { status: 409 });
    this.batch.stop_requested = true;
    this.batch.updated_at = new Date().toISOString();
    await this.save();
    return this.batch;
  }

  log(line) {
    const value = line.trim();
    if (!value) return;
    this.batch.logs.push(value.slice(0, 500));
    if (this.batch.logs.length > 60) this.batch.logs.shift();
    this.batch.updated_at = new Date().toISOString();
  }

  async run() {
    for (const username of this.batch.profiles) {
      if (this.batch.stop_requested) break;
      const result = this.batch.results[username];
      result.status = 'running';
      result.started_at = new Date().toISOString();
      this.batch.current = username;
      this.batch.updated_at = result.started_at;
      await this.save();
      this.log(`Starting @${username}`);
      const child = spawn(process.execPath,
        ['src/cli.mjs', 'collect', `--username=${username}`, '--reels-only', '--headless'],
        { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding('utf8');
        let pending = '';
        stream.on('data', (chunk) => {
          pending += chunk;
          const lines = pending.split(/\r?\n/);
          pending = lines.pop() || '';
          for (const line of lines) this.log(line);
        });
        stream.on('end', () => { if (pending) this.log(pending); });
      }
      const exit = await new Promise((resolveExit) => {
        let error = null;
        child.once('error', (value) => { error = value; });
        child.once('close', (code) => resolveExit({ code, error }));
      });
      const collected = await profileData(username);
      result.finished_at = new Date().toISOString();
      result.status = exit.code === 0
        ? collected.run.status === 'complete' ? 'complete' : 'needs_review'
        : 'failed';
      result.error = exit.error?.message || (exit.code === 0 ? collected.run.error || null
        : collected.run.error || `Collector exited with code ${exit.code}.`);
      this.log(`Finished @${username}: ${result.status}`);
      this.batch.current = null;
      this.batch.updated_at = result.finished_at;
      await this.save();
    }
    this.batch.status = this.batch.stop_requested ? 'stopped' : 'complete';
    this.batch.finished_at = new Date().toISOString();
    this.batch.updated_at = this.batch.finished_at;
    this.active = false;
    await this.save();
  }
}

const runner = new BatchRunner();
await runner.load();

const assets = new Map([
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/shared.js', ['shared.js', 'text/javascript; charset=utf-8']],
  ['/queue.js', ['queue.js', 'text/javascript; charset=utf-8']],
  ['/profile.js', ['profile.js', 'text/javascript; charset=utf-8']],
  ['/overview.js', ['overview.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]
]);

async function sendFile(response, file, type) {
  try {
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    response.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') json(response, 404, { error: 'File not found.' });
    else throw error;
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    const pathname = url.pathname;
    if (request.method === 'POST') {
      const expected = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
      if (!expected.includes(request.headers.origin) || !request.headers['content-type']?.startsWith('application/json')) {
        return json(response, 403, { error: 'Use this local UI to start or stop collection.' });
      }
      if (pathname === '/api/runs') return json(response, 202, await runner.start((await body(request)).profiles));
      if (pathname === '/api/runs/stop') return json(response, 200, await runner.stop());
      return json(response, 404, { error: 'Unknown action.' });
    }
    if (request.method !== 'GET') return json(response, 405, { error: 'Method not allowed.' });
    if (pathname === '/api/health') return json(response, 200, { ok: true, active: runner.active });
    if (pathname === '/api/catalog') return json(response, 200, { profiles: await catalog() });
    if (pathname === '/api/summary') return json(response, 200, await summary());
    if (pathname === '/api/run') {
      const profiles = runner.batch?.profiles || [];
      const summaries = await Promise.all(profiles.map(async (username) => profileSummary(await profileData(username))));
      return json(response, 200, { batch: runner.batch, profiles: summaries });
    }
    if (pathname.startsWith('/api/profiles/')) {
      const username = await resolveUsername(decodeURIComponent(pathname.slice('/api/profiles/'.length)));
      return username ? json(response, 200, await detail(username)) : json(response, 404, { error: 'Profile not in catalog.' });
    }
    if (pathname.startsWith('/reports/')) {
      const username = await resolveUsername(decodeURIComponent(pathname.slice('/reports/'.length)));
      return username ? sendFile(response, paths(root, username).report, 'text/html; charset=utf-8')
        : json(response, 404, { error: 'Profile not in catalog.' });
    }
    if (assets.has(pathname)) {
      const [file, type] = assets.get(pathname);
      return sendFile(response, join(publicDir, file), type);
    }
    if (pathname === '/' || pathname === '/summary' || pathname.startsWith('/profiles/')) {
      return sendFile(response, join(publicDir, 'index.html'), 'text/html; charset=utf-8');
    }
    return json(response, 404, { error: 'Page not found.' });
  } catch (error) {
    console.error(error);
    if (!response.headersSent) json(response, error.status || 500, { error: error.status ? error.message : 'The local UI encountered an error.' });
    else response.end();
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Collector UI: http://127.0.0.1:${port}`);
});
