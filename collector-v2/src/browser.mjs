import { join } from 'node:path';
import { chromium } from 'playwright';
import { canonicalItemUrl, clean } from './model.mjs';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launch(root, { headless = false } = {}) {
  const context = await chromium.launchPersistentContext(join(root, '.auth', 'browser'), {
    headless,
    viewport: { width: 1320, height: 950 },
    locale: 'en-US',
    timezoneId: 'Asia/Kolkata',
    slowMo: 0
  });
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(15000);
  return { context, page };
}

function blocked(url, text) {
  if (/\/accounts\/login|\/challenge\//.test(new URL(url).pathname)) return 'Instagram requires login or a security checkpoint.';
  if (/please wait a few minutes|try again later|challenge_required|checkpoint_required/i.test(text)) return 'Instagram showed a temporary limit or checkpoint.';
  if (/sorry, this page isn't available|page may have been removed/i.test(text)) return 'Instagram reports this page is unavailable.';
  return '';
}

async function open(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('main, [role="main"]').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await pause(900);
  const text = await page.locator('body').innerText().catch(() => '');
  const reason = blocked(page.url(), text.slice(0, 10000));
  if (reason) throw new Error(reason);
  if (!text.trim()) throw new Error('Instagram rendered an empty page.');
}

async function aboutText(page) {
  const selectors = [
    page.getByRole('button', { name: /^(options|more options|profile options)$/i }).first(),
    page.locator('main header button').filter({ has: page.locator('svg[aria-label*="options" i]') }).first()
  ];
  let opened = false;
  for (const button of selectors) {
    try { if (await button.isVisible({ timeout: 1200 })) { await button.click(); opened = true; break; } }
    catch { /* Instagram can rename the control. */ }
  }
  if (!opened) return '';
  try {
    const about = page.getByText(/about this (account|profile)/i).last();
    await about.click({ timeout: 5000 });
    const dialog = page.getByRole('dialog').last();
    await dialog.waitFor({ timeout: 8000 });
    return await dialog.innerText();
  } catch { return ''; }
  finally { await page.keyboard.press('Escape').catch(() => {}); }
}

export async function captureProfile(page, username) {
  await open(page, `https://www.instagram.com/${username}/`);
  const headerText = await page.locator('main header').first().innerText().catch(() => '');
  const about = await aboutText(page);
  const meta = await page.evaluate(() => ({
    description: document.querySelector('meta[name="description"]')?.content || '',
    profile_picture_url: document.querySelector('main header img')?.src || document.querySelector('meta[property="og:image"]')?.content || ''
  }));
  return { header_text: headerText, about_text: about, ...meta };
}

export async function discover(page, username, kind, onProgress, { maxPasses = 240 } = {}) {
  const url = `https://www.instagram.com/${username}/${kind === 'reel' ? 'reels/' : ''}`;
  await open(page, url);
  const found = new Map();
  let stable = 0;
  let complete = false;
  let reason = '';
  for (let pass = 0; pass < maxPasses; pass++) {
    const raw = await page.evaluate(() => [...document.querySelectorAll('main a[href]')].map((anchor) => ({
      href: anchor.href,
      label: anchor.getAttribute('aria-label') || '',
      text: anchor.innerText || ''
    })));
    const sizeBefore = found.size;
    for (const anchor of raw) {
      const pathname = new URL(anchor.href).pathname;
      const owner = pathname.match(/^\/([^/]+)\/(?:p|reel|reels)\//)?.[1];
      if (owner && owner.toLowerCase() !== username.toLowerCase()) continue;
      const item = canonicalItemUrl(anchor.href);
      if (item?.kind !== kind) continue;
      const tileText = clean(anchor.label || anchor.text);
      const views = kind === 'reel' ? (tileText.match(/([\d,.]+\s*[KMB]?)\s*(?:views?|plays?)/i)?.[1]
        || (/^[\d,.]+\s*[KMB]?$/i.test(tileText) ? tileText : null)) : null;
      found.set(item.url, { ...found.get(item.url), ...item, grid_views_raw: views || found.get(item.url)?.grid_views_raw || null });
    }
    if (found.size !== sizeBefore) await onProgress([...found.values()], false);
    const state = await page.evaluate(() => ({
      y: window.scrollY,
      height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
      viewport: window.innerHeight,
      loading: !!document.querySelector('[role="progressbar"]'),
      text: (document.querySelector('main')?.innerText || '').slice(0, 1500),
      gate: /Sign up and never miss a post|See photos, videos and more from/i.test(document.body.innerText || '')
    }));
    reason = blocked(page.url(), state.text);
    if (reason) break;
    if (state.gate) { reason = 'The logged out preview showed a limited grid. Sign in to discover the full list.'; break; }
    const empty = kind === 'reel' ? /no reels|hasn't posted any reels|no content to show/i.test(state.text)
      : /no posts yet|hasn't posted/i.test(state.text);
    if (!found.size && empty) { complete = true; break; }
    const atBottom = state.y + state.viewport >= state.height - 12;
    stable = atBottom && found.size === sizeBefore && !state.loading ? stable + 1 : 0;
    if (stable >= 5 && found.size > 0) { complete = true; break; }
    await page.evaluate(() => window.scrollBy(0, Math.max(500, Math.floor(window.innerHeight * .8))));
    await pause(850);
  }
  if (!complete && !reason) reason = 'Grid scan ended before confirming the last item.';
  await onProgress([...found.values()], complete, reason);
  return { items: [...found.values()], complete, error: reason };
}

export async function captureItem(page, item) {
  await open(page, item.url);
  if (canonicalItemUrl(page.url())?.shortcode !== item.shortcode) throw new Error('Instagram redirected to a different item.');
  const snapshot = await page.evaluate(() => {
    const article = document.querySelector('main article, [role="dialog"] article, article, main') || document.body;
    const meta = (selector) => document.querySelector(selector)?.content || '';
    const time = article.querySelector('time[datetime]') || document.querySelector('time[datetime]');
    return {
      datetime: time?.getAttribute('datetime') || '',
      article_text: article.innerText || '',
      aria_text: [...article.querySelectorAll('[aria-label], [title]')].slice(0, 200)
        .map((element) => [element.getAttribute('aria-label'), element.getAttribute('title')].filter(Boolean).join(' ')).join('\n'),
      caption: article.querySelector('h1')?.innerText || '',
      og_description: meta('meta[property="og:description"]'),
      og_image: meta('meta[property="og:image"]'),
      og_video: meta('meta[property="og:video"]'),
      json_ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((element) => element.textContent || '')
    };
  });
  if (!clean(snapshot.article_text)) throw new Error('Item page rendered no readable content.');
  return snapshot;
}
