(() => {
  'use strict';

  const NOT_SHOWN = 'Not shown';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clean = (value) => String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
  const normalize = (value) => clean(value).toLocaleLowerCase().replace(/:$/, '');

  function visible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function label(element) {
    return clean([element.getAttribute('aria-label'), element.getAttribute('title'), element.innerText, element.textContent].filter(Boolean).join(' '));
  }

  function clickable(root = document) {
    return [...root.querySelectorAll("button, [role='button'], [role='menuitem'], [tabindex='0'], a")].filter(visible);
  }

  async function waitFor(read, timeout = 12000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const result = read();
      if (result) return result;
      await sleep(250);
    }
    return null;
  }

  function textLines(value) {
    return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  function profileText() {
    return (document.querySelector('main header') || document.querySelector('main') || document.body).innerText || '';
  }

  async function expandBio() {
    const header = document.querySelector('main header');
    for (let attempt = 0; header && attempt < 2; attempt += 1) {
      const more = clickable(header).find((element) => /^(more|see translation)$/i.test(clean(element.innerText || element.getAttribute('aria-label'))));
      if (!more) return;
      more.click();
      await sleep(450);
    }
  }

  function postsCount(value) {
    const match = String(value || '').match(/([\d.,]+\s*[KMB]?)\s+posts?\b/i);
    return match ? match[1].replace(/\s+/g, '') : NOT_SHOWN;
  }

  function bioFrom(text, username) {
    const lines = textLines(text);
    const stat = /\b(followers?|following|posts?)\b/i;
    const start = lines.findIndex((line) => stat.test(line));
    if (start < 0) return NOT_SHOWN;
    const stop = new Set(['follow', 'following', 'message', 'edit profile', 'share profile', 'posts', 'reels', 'tagged', 'more', 'see translation', 'contact']);
    const bio = [];
    for (const line of lines.slice(start + 1)) {
      if (stop.has(normalize(line))) break;
      if (normalize(line) === normalize(username) || stat.test(line)) continue;
      bio.push(line);
    }
    return bio.join('\n') || NOT_SHOWN;
  }

  function aboutText() {
    return [...document.querySelectorAll('body *')].filter(visible).map((element) => element.innerText || '')
      .filter((value) => /about this account/i.test(value) && (/date joined/i.test(value) || /account based in/i.test(value)))
      .sort((a, b) => a.length - b.length)[0] || '';
  }

  function valueAfter(text, wantedLabel) {
    const lines = textLines(text);
    const index = lines.findIndex((line) => normalize(line) === normalize(wantedLabel));
    if (index < 0) return NOT_SHOWN;
    for (const line of lines.slice(index + 1, index + 4)) {
      if (!['date joined', 'account based in', 'former usernames'].includes(normalize(line))) return line;
    }
    return NOT_SHOWN;
  }

  async function collectSurface(step) {
    await waitFor(() => document.querySelector('main'));
    await sleep(700);
    await expandBio();
    const capturedProfile = profileText();
    const header = document.querySelector('main header');
    const buttons = clickable(document.querySelector('main') || document);
    let options = buttons.find((element) => /^(options|more options|profile options)$/i.test(label(element)));
    options ||= buttons.find((element) => /\b(options|more options)\b/i.test(label(element)));
    if (!options) {
      const unavailable = /page isn['’]t available|page may have been removed/i.test(capturedProfile);
      return {
        bio: bioFrom(capturedProfile, step.username), posts_count: postsCount(capturedProfile), profile_text: capturedProfile,
        about_text: '', country: NOT_SHOWN, date_joined: NOT_SHOWN,
        status: unavailable ? 'Deleted account' : 'Collection failed',
        last_error: unavailable ? 'Instagram reports that this profile is unavailable.' : 'Profile options button was not found.',
        issues: [{ code: unavailable ? 'ACCOUNT_UNAVAILABLE' : 'PROFILE_OPTIONS_MISSING', message: unavailable ? 'Instagram reports that this profile is unavailable.' : 'Could not open profile options to read account details.' }]
      };
    }
    options.click();
    const aboutItem = await waitFor(() => clickable(document).find((element) => /about this account|about this profile/i.test(label(element))));
    if (!aboutItem) return failedSurface(step, capturedProfile, 'About this account menu item was not found.');
    aboutItem.click();
    let about = await waitFor(aboutText, 15000);
    if (!about) {
      const retry = clickable(document).find((element) => /about this account|about this profile/i.test(label(element)));
      if (retry) { retry.click(); about = await waitFor(aboutText, 10000); }
    }
    if (!about) return failedSurface(step, capturedProfile, 'About this account details did not open.');

    const count = postsCount(capturedProfile);
    const country = valueAfter(about, 'Account based in');
    const joined = valueAfter(about, 'Date joined');
    const issues = [];
    if (count === NOT_SHOWN) issues.push({ code: 'POST_COUNT_UNAVAILABLE', message: 'Could not identify the post count in the profile header.' });
    if (joined === NOT_SHOWN) issues.push({ code: 'DATE_JOINED_UNAVAILABLE', message: 'Could not identify the Date joined value in About this account.' });
    return {
      bio: bioFrom(capturedProfile, step.username), country, date_joined: joined,
      posts_count: count, profile_text: capturedProfile, about_text: about,
      status: 'Collected', last_error: '', issues
    };
  }

  async function collectPostCount() {
    const main = await waitFor(() => document.querySelector('main'));
    if (!main) return { posts_count: NOT_SHOWN, error: 'Instagram profile content did not load.' };
    await sleep(650);
    const count = postsCount(profileText());
    return {
      posts_count: count,
      error: count === NOT_SHOWN ? 'Could not identify the post count in the profile header.' : ''
    };
  }

  function reelUrls() {
    const urls = new Set();
    for (const anchor of document.querySelectorAll('a[href]')) {
      try {
        const url = new URL(anchor.href, location.origin);
        if (url.origin !== location.origin) continue;
        const match = url.pathname.match(/^\/(?:[^/]+\/)?reels?\/([^/]+)\/?$/);
        if (match) urls.add(decodeURIComponent(match[1]));
      } catch (_error) { /* Ignore invalid links. */ }
    }
    return urls;
  }

  function reelScanBlockReason() {
    const alertText = [...document.querySelectorAll('[role="alert"], [role="dialog"]')]
      .map((element) => element.innerText || '').join(' ').toLocaleLowerCase();
    const mainText = String(document.querySelector('main')?.innerText || '').toLocaleLowerCase();
    if (/\/accounts\/login|\/challenge\//.test(location.pathname)) {
      return 'Instagram redirected to login or a security checkpoint.';
    }
    if (/challenge_required|checkpoint_required|please wait a few minutes|try again later/.test(alertText)) {
      return 'Instagram showed a checkpoint, rate limit, or temporary error during the Reels scan.';
    }
    if (/sorry, this page isn't available|page may have been removed/.test(mainText)) {
      return 'The profile or its Reels page is unavailable.';
    }
    return '';
  }

  async function collectReelCount() {
    const main = await waitFor(() => document.querySelector('main'));
    if (!main) return { reels_count: null, complete: false, error: 'Instagram Reels page content did not load.' };
    if (!/^\/[^/]+\/reels\/?$/.test(location.pathname)) {
      return { reels_count: null, complete: false, error: 'Instagram did not stay on the profile Reels tab.' };
    }

    const ids = new Set();
    const maxPasses = 1200;
    const stablePassesRequired = 5;
    let stablePasses = 0;
    let reachedEnd = false;
    let error = '';

    for (let pass = 0; pass < maxPasses; pass += 1) {
      if (!/^\/[^/]+\/reels\/?$/.test(location.pathname)) {
        error = 'Instagram navigated away from the profile Reels tab during the scan.';
        break;
      }
      error = reelScanBlockReason();
      if (error) break;
      reelUrls().forEach((id) => ids.add(id));
      const previousCount = ids.size;
      const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      window.scrollBy(0, Math.max(500, Math.floor(window.innerHeight * 0.75)));
      await sleep(900);
      reelUrls().forEach((id) => ids.add(id));
      error = reelScanBlockReason();
      if (error) break;

      const atBottom = window.scrollY + window.innerHeight >= Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - 8;
      const loading = [...document.querySelectorAll('[role="progressbar"], svg[aria-label*="Loading" i]')].some(visible);
      if (atBottom && ids.size === previousCount && !loading) stablePasses += 1;
      else stablePasses = 0;
      if (stablePasses >= stablePassesRequired) {
        reachedEnd = true;
        break;
      }

      const newHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      if (newHeight <= scrollHeight && ids.size === previousCount && !atBottom) await sleep(600);
    }

    const emptyState = /no reels|hasn't posted any reels|no content to show/i.test(main.innerText || '');
    const complete = !error && reachedEnd && (ids.size > 0 || emptyState);
    return {
      reels_count: complete ? ids.size : null,
      partial_count: ids.size,
      complete,
      error: error || (!complete ? ids.size === 0
        ? 'No reel links loaded and Instagram did not show a clear empty state.'
        : 'Scrolling stopped without confirming that the Reels tab reached its end.' : '')
    };
  }

  function failedSurface(step, capturedProfile, message) {
    return {
      bio: bioFrom(capturedProfile, step.username), country: NOT_SHOWN, date_joined: NOT_SHOWN,
      posts_count: postsCount(capturedProfile), profile_text: capturedProfile, about_text: '',
      status: 'Collection failed', last_error: message,
      issues: [{ code: 'ABOUT_DETAILS_UNAVAILABLE', message }]
    };
  }

  function postUrls() {
    const urls = new Set();
    for (const anchor of document.querySelectorAll('main a[href]')) {
      try {
        const url = new URL(anchor.href, location.origin);
        if (/^\/(p|reel|tv)\/[^/]+\/?$/.test(url.pathname)) urls.add(`https://www.instagram.com${url.pathname}`);
      } catch (_error) { /* Ignore invalid post links. */ }
    }
    return [...urls];
  }

  function contentItemEntries(kind) {
    const items = new Map();
    for (const anchor of document.querySelectorAll('main a[href], a[href]')) {
      try {
        const url = new URL(anchor.href, location.origin);
        if (url.origin !== location.origin) continue;
        let itemUrl = '';
        if (kind === 'post' && /^\/(?:p|tv)\/[^/]+\/?$/.test(url.pathname)) {
          itemUrl = `https://www.instagram.com${url.pathname}`;
        } else if (kind === 'reel') {
          // Instagram exposes reel tiles as both /reel/<id>/ and
          // /<username>/reel/<id>/ (the latter was missed by the old matcher).
          const match = url.pathname.match(/^\/(?:[^/]+\/reels?\/|reel\/)([^/]+)\/?$/);
          if (match) itemUrl = `https://www.instagram.com/reel/${encodeURIComponent(decodeURIComponent(match[1]))}/`;
        }
        if (!itemUrl) continue;
        const item = items.get(itemUrl) || { url: itemUrl };
        if (kind === 'reel') {
          const tileText = [anchor.getAttribute('aria-label'), anchor.getAttribute('title'), anchor.innerText, anchor.textContent].filter(Boolean);
          let views = metricFrom(tileText, [/([\d,.]+\s*[KMB]?)\s*(?:views?|plays?)\b/i]);
          if (views === null) {
            const countLines = [
              ...tileText.flatMap((value) => String(value).split(/\r?\n/)),
              ...[...anchor.querySelectorAll('span')].map((span) => span.innerText || span.textContent || '')
            ].map(clean).filter((value) => /^[\d,.]+\s*[KMB]?$/i.test(value));
            views = countLines.map(compactCount).find((value) => value !== null) ?? null;
          }
          if (views !== null) item.views_count = views;
        }
        items.set(itemUrl, item);
      } catch (_error) { /* Ignore invalid links. */ }
    }
    return [...items.values()];
  }

  function reelCode(value) {
    try {
      const pathname = new URL(value, location.origin).pathname;
      const match = pathname.match(/^\/(?:[^/]+\/reels?\/|reel\/)([^/]+)\/?$/);
      return match ? decodeURIComponent(match[1]) : '';
    } catch (_error) { return ''; }
  }

  async function openReelFromGrid(contentUrl) {
    const targetCode = reelCode(contentUrl);
    if (!targetCode) return 'The queued reel URL could not be identified.';
    const basePath = `/${decodeURIComponent(location.pathname.split('/')[1] || '')}/reels/`;
    const currentPath = decodeURIComponent(location.pathname);
    if (currentPath.startsWith(basePath) && reelCode(location.href) === targetCode) return '';

    if (currentPath.startsWith(basePath) && currentPath !== basePath) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await waitFor(() => decodeURIComponent(location.pathname) === basePath, 5000);
    }

    let direction = window.scrollY <= 4 ? 1 : -1;
    let edgesReached = 0;
    for (let pass = 0; pass < 480; pass += 1) {
      const anchor = [...document.querySelectorAll('main a[href], a[href]')]
        .find((item) => reelCode(item.href) === targetCode);
      if (anchor) {
        anchor.scrollIntoView({ block: 'center' });
        await sleep(200);
        anchor.click();
        const opened = await waitFor(() => {
          const path = decodeURIComponent(location.pathname);
          return path.startsWith(basePath) && path !== basePath && reelCode(location.href) === targetCode;
        }, 10000);
        if (opened) return '';
        return 'Clicking the reel tile did not open its Instagram detail view.';
      }
      const previousY = window.scrollY;
      window.scrollBy(0, direction * Math.max(400, Math.floor(window.innerHeight * 0.7)));
      await sleep(250);
      if (Math.abs(window.scrollY - previousY) < 2) {
        edgesReached += 1;
        if (edgesReached >= 2) break;
        direction *= -1;
      }
    }
    return 'The reel tile was not found in the profile grid.';
  }

  function contentScanBlockReason() {
    const alerts = [...document.querySelectorAll('[role="alert"], [role="dialog"]')]
      .map((element) => element.innerText || '').join(' ').toLocaleLowerCase();
    const mainText = String(document.querySelector('main')?.innerText || '').toLocaleLowerCase();
    if (/\/accounts\/login|\/challenge\//.test(location.pathname)) return 'Instagram redirected to login or a security checkpoint.';
    if (/challenge_required|checkpoint_required|please wait a few minutes|try again later/.test(alerts)) return 'Instagram showed a checkpoint, rate limit, or temporary error.';
    if (/sorry, this page isn't available|page may have been removed/.test(mainText)) return 'This profile content page is unavailable.';
    return '';
  }

  async function collectContentUrls(kind) {
    const main = await waitFor(() => document.querySelector('main'));
    if (!main) return { content_urls: [], complete: false, error: 'Instagram profile content did not load.' };
    if (kind === 'reel' && !/^\/[^/]+\/reels\/?$/.test(location.pathname)) {
      return { content_urls: [], complete: false, error: 'Instagram did not stay on the profile Reels tab.' };
    }
    const items = new Map();
    const addItems = (entries) => entries.forEach((entry) => {
      const item = items.get(entry.url) || { url: entry.url };
      if (Number.isSafeInteger(entry.views_count) && entry.views_count >= 0) item.views_count = entry.views_count;
      items.set(entry.url, item);
    });
    addItems(contentItemEntries(kind));
    let stablePasses = 0;
    let reachedEnd = false;
    let error = '';
    const emptyPattern = kind === 'reel' ? /no reels|hasn't posted any reels|no content to show/i : /no posts yet|hasn't posted/i;
    const emptyState = emptyPattern.test(main.innerText || '');
    if (!items.size && emptyState) return { content_urls: [], grid_views_counts: {}, complete: true, error: '' };

    for (let pass = 0; pass < 1200; pass += 1) {
      error = contentScanBlockReason();
      if (error) break;
      addItems(contentItemEntries(kind));
      const previousCount = items.size;
      window.scrollBy(0, Math.max(500, Math.floor(window.innerHeight * 0.75)));
      await sleep(800);
      addItems(contentItemEntries(kind));
      const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const atBottom = window.scrollY + window.innerHeight >= height - 8;
      const loading = [...document.querySelectorAll('[role="progressbar"], svg[aria-label*="Loading" i]')].some(visible);
      if (atBottom && items.size === previousCount && !loading) stablePasses += 1;
      else stablePasses = 0;
      if (stablePasses >= 5) { reachedEnd = true; break; }
    }
    // Reaching the bottom with zero links is not proof of an empty account:
    // a changed Instagram URL shape or failed grid render can also cause it.
    const complete = !error && ((reachedEnd && items.size > 0) || emptyState);
    const orderedItems = [...items.values()];
    if (kind === 'reel') orderedItems.reverse();
    return {
      content_urls: orderedItems.map((item) => item.url),
      grid_views_counts: Object.fromEntries(orderedItems.filter((item) => Number.isSafeInteger(item.views_count)).map((item) => [item.url, item.views_count])),
      complete,
      error: error || (!complete ? 'Scrolling stopped before Instagram confirmed the end of the content list.' : '')
    };
  }

  async function collectAllPostUrls() {
    const urls = new Set(postUrls());
    let priorHeight = 0;
    let stable = 0;
    for (let pass = 0; pass < 1000 && stable < 4; pass += 1) {
      const before = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      window.scrollTo(0, before);
      await sleep(550);
      postUrls().forEach((url) => urls.add(url));
      const after = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      stable = after <= before && after === priorHeight ? stable + 1 : 0;
      priorHeight = after;
    }
    window.scrollTo(0, 0);
    return [...urls];
  }

  async function collectDeepProfile() {
    await waitFor(() => document.querySelector('main'));
    await sleep(700);
    const urls = await collectAllPostUrls();
    return { post_urls: urls };
  }

  async function collectPostDate() {
    const time = await waitFor(() => [...document.querySelectorAll('main time[datetime], article time[datetime], time[datetime]')]
      .find((item) => !Number.isNaN(Date.parse(item.dateTime || item.getAttribute('datetime')))), 12000);
    if (!time) return { date: NOT_SHOWN, error: 'No post timestamp was found on this page.' };
    return { date: new Date(time.dateTime || time.getAttribute('datetime')).toISOString() };
  }

  function compactCount(value) {
    const match = String(value || '').replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i);
    if (!match) return null;
    const scale = ({ k: 1_000, m: 1_000_000, b: 1_000_000_000 }[String(match[2] || '').toLocaleLowerCase()] || 1);
    const count = Math.round(Number(match[1]) * scale);
    return Number.isSafeInteger(count) && count >= 0 ? count : null;
  }

  function metricFrom(contexts, patterns) {
    for (const context of contexts) {
      for (const pattern of patterns) {
        const match = String(context || '').match(pattern);
        if (match) {
          const count = compactCount(match[1]);
          if (count !== null) return count;
        }
      }
    }
    return null;
  }

  async function collectContentDetails(step) {
    if (step.content_kind === 'reel') {
      const openError = await openReelFromGrid(step.content_url);
      if (openError) return { error: openError, errors: [] };
    }
    const main = await waitFor(() => document.querySelector('main, [role="main"]'));
    if (!main) return { error: 'Instagram content did not load.', errors: [] };
    await sleep(700);
    const dialog = document.querySelector('[role="dialog"]');
    const article = dialog?.querySelector('article') || dialog || document.querySelector('main article, [role="main"] article, article') || main;
    const visibleText = clean(article.innerText || main.innerText || '');
    const description = document.querySelector('meta[property="og:description"]')?.content || '';
    const ariaText = [...article.querySelectorAll('[aria-label], [title]')]
      .filter(visible).map((element) => `${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''}`).join('\n');
    const contexts = [description, ariaText, visibleText];
    const time = [...article.querySelectorAll('time[datetime]')]
      .find((item) => !Number.isNaN(Date.parse(item.dateTime || item.getAttribute('datetime'))))
      || [...document.querySelectorAll('[role="dialog"] time[datetime], time[datetime]')].find((item) => !Number.isNaN(Date.parse(item.dateTime || item.getAttribute('datetime'))));
    const date = time ? new Date(time.dateTime || time.getAttribute('datetime')).toISOString() : null;
    let likesCount = metricFrom(contexts, [/(\d[\d,.]*\s*[KMB]?)\s+likes?\b/i]);
    if (likesCount === null) {
      const others = metricFrom(contexts, [/and\s+(\d[\d,.]*\s*[KMB]?)\s+others?\b/i]);
      if (others !== null) likesCount = others + 1;
    }
    const commentsCount = metricFrom(contexts, [/(?:view|see)\s+all\s+(\d[\d,.]*\s*[KMB]?)\s+comments?\b/i, /(\d[\d,.]*\s*[KMB]?)\s+comments?\b/i]);
    let viewsCount = metricFrom(contexts, [/(\d[\d,.]*\s*[KMB]?)\s+(?:views?|plays?)\b/i]);
    let viewsCountSource = viewsCount === null ? '' : 'item_page';
    if (viewsCount === null && Number.isSafeInteger(step.grid_views_count) && step.grid_views_count >= 0) {
      viewsCount = step.grid_views_count;
      viewsCountSource = 'profile_grid';
    }
    const errors = [];
    if (!date) errors.push({ field: 'date', message: 'No post timestamp was found on this content page.' });
    if (likesCount === null) errors.push({ field: 'likes_count', message: 'Instagram did not expose a readable like count on this content page.' });
    if (commentsCount === null) errors.push({ field: 'comments_count', message: 'Instagram did not expose a readable comment count on this content page.' });
    if (viewsCount === null) errors.push({ field: 'views_count', message: 'Instagram did not expose a readable view count on this content page.' });
    return { date, likes_count: likesCount, comments_count: commentsCount, views_count: viewsCount, views_count_source: viewsCountSource, errors };
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'dedgram_collect') return undefined;
    const { step } = message;
    if (step.stage === 'surface') return collectSurface(step);
    if (step.stage === 'post_count') return collectPostCount();
    if (step.stage === 'reels_count') return collectReelCount();
    if (step.stage === 'post_content_profile') return collectContentUrls('post');
    if (step.stage === 'reel_content_profile') return collectContentUrls('reel');
    if (step.stage === 'content_item') return collectContentDetails(step);
    if (step.stage === 'deep_profile') return collectDeepProfile();
    if (step.stage === 'deep_post') return collectPostDate();
    return { error: 'Unknown collection stage.' };
  });
})();
