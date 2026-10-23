import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { captureProfile, discover, captureItem } from '../src/browser.mjs';
import { profileFromSnapshot, itemFromSnapshot } from '../src/model.mjs';

test('browser adapter collects a profile, both grids, and a direct item page', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await context.route('https://www.instagram.com/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let html;
    if (pathname === '/edlt.shox/') html = `<main><header>edlt.shox\n0 posts\n20.7K followers\n0 following\nTest bio\nFollow<button aria-label="Options">Options</button></header><a href="/p/POST1/">post</a></main><script>document.querySelector('button').onclick=()=>{const d=document.createElement('div'); d.innerHTML='<button>About this account</button>';document.body.append(d);d.querySelector('button').onclick=()=>{const x=document.createElement('div');x.setAttribute('role','dialog');x.innerText='About this account\\nDate joined\\nSeptember 2026\\nAccount based in\\nTajikistan';document.body.append(x)}};</script>`;
    else if (pathname === '/edlt.shox/reels/') html = '<main><a href="/reel/REEL1/">1.2K views</a></main>';
    else if (pathname === '/reel/REEL1/') html = '<meta property="og:description" content="12 likes, 3 comments - edlt.shox: hello #tag"><main><article><h1>hello #tag</h1><time datetime="2026-10-01T00:00:00Z"></time>1.2K views</article></main>';
    else html = '<main>empty</main>';
    await route.fulfill({ status: 200, contentType: 'text/html', body: html });
  });
  try {
    const profile = profileFromSnapshot('edlt.shox', await captureProfile(page, 'edlt.shox'));
    assert.equal(profile.followers_count.value, 20700);
    assert.equal(profile.account_based_in, 'Tajikistan');
    const posts = await discover(page, 'edlt.shox', 'post', async () => {}, { maxPasses: 8 });
    const reels = await discover(page, 'edlt.shox', 'reel', async () => {}, { maxPasses: 8 });
    assert.equal(posts.items.length, 1);
    assert.equal(reels.items.length, 1);
    const item = itemFromSnapshot(reels.items[0], await captureItem(page, reels.items[0]));
    assert.equal(item.status, 'complete');
    assert.equal(item.likes.value, 12);
    assert.equal(item.comments.value, 3);
  } finally { await browser.close(); }
}, { timeout: 40000 });
