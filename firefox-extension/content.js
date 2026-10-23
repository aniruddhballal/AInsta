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

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'dedgram_collect') return undefined;
    const { step } = message;
    if (step.stage === 'surface') return collectSurface(step);
    if (step.stage === 'deep_profile') return collectDeepProfile();
    if (step.stage === 'deep_post') return collectPostDate();
    return { error: 'Unknown collection stage.' };
  });
})();
