(() => {
  'use strict';

  const API = 'http://127.0.0.1:4317/api';
  const WAIT_MS = 1500;
  let busy = false;
  let collectorTabId = null;
  let stopped = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function postResult(step, result) {
    const response = await fetch(`${API}/extension/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: step.job_id, profile_key: step.profile_key, stage: step.stage, result })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Dashboard rejected the collection result (${response.status}).`);
    }
  }

  async function getCollectorTab() {
    if (collectorTabId !== null) {
      try {
        const existing = await browser.tabs.get(collectorTabId);
        if (existing) return existing;
      } catch (_error) { collectorTabId = null; }
    }
    const tabs = await browser.tabs.query({ url: ['*://www.instagram.com/*', '*://instagram.com/*'] });
    if (tabs.length) {
      collectorTabId = tabs[0].id;
      return tabs[0];
    }
    const created = await browser.tabs.create({ url: 'https://www.instagram.com/', active: true });
    collectorTabId = created.id;
    return created;
  }

  async function loadStep(step) {
    const url = step.stage === 'deep_post' ? step.post_url
      : step.stage === 'content_item' && step.content_kind === 'reel' ? reelsUrl(step.url)
        : step.stage === 'content_item' ? step.content_url
        : step.stage === 'reels_count' || step.stage === 'reel_content_profile' ? reelsUrl(step.url) : step.url;
    const tab = await getCollectorTab();
    const keepReelGridOpen = step.stage === 'content_item' && step.content_kind === 'reel'
      && tab.url.startsWith(url);
    if (tab.url !== url && !keepReelGridOpen) {
      const loaded = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          browser.tabs.onUpdated.removeListener(listener);
          reject(new Error('Timed out waiting for Instagram to load.'));
        }, 45000);
        function listener(tabId, changeInfo) {
          if (tabId !== tab.id || changeInfo.status !== 'complete') return;
          clearTimeout(timeout);
          browser.tabs.onUpdated.removeListener(listener);
          resolve();
        }
        browser.tabs.onUpdated.addListener(listener);
      });
      await browser.tabs.update(tab.id, { url, active: true });
      await loaded;
    } else {
      await sleep(900);
    }

    let lastError;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        const value = await browser.tabs.sendMessage(tab.id, { type: 'dedgram_collect', step });
        if (value) return value;
      } catch (error) { lastError = error; }
      await sleep(700);
    }
    throw lastError || new Error('The Instagram page did not respond to the collector.');
  }

  function reelsUrl(profileUrl) {
    const url = new URL(profileUrl);
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/reels/`;
    url.search = '';
    url.hash = '';
    return url.href;
  }

  async function poll() {
    if (busy || stopped) return;
    busy = true;
    try {
      const response = await fetch(`${API}/extension/next`);
      if (!response.ok) throw new Error(`Dashboard API returned ${response.status}.`);
      const { idle, step } = await response.json();
      if (!idle && step) {
        try {
          const result = await loadStep(step);
          await postResult(step, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const result = step.stage === 'surface'
            ? { status: 'Collection failed', last_error: message, issues: [{ code: 'SURFACE_COLLECTION_FAILED', message }] }
            : step.stage === 'post_count'
              ? { posts_count: 'Not shown', error: message }
            : step.stage === 'reels_count'
                ? { reels_count: null, complete: false, error: message }
            : step.stage === 'post_content_profile' || step.stage === 'reel_content_profile'
              ? { content_urls: [], complete: false, error: message }
            : step.stage === 'content_item'
              ? { error: message, errors: [] }
            : step.stage === 'deep_profile'
              ? { post_urls: [], error: message }
              : { date: 'Not shown', error: message };
          await postResult(step, result);
        }
      }
    } catch (error) {
      console.debug('[dedgram] Local dashboard is idle or unavailable.', error);
    } finally {
      busy = false;
      setTimeout(poll, WAIT_MS);
    }
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'dedgram_stop') stopped = true;
  });
  browser.runtime.onStartup.addListener(() => { stopped = false; void poll(); });
  browser.runtime.onInstalled.addListener(() => { stopped = false; void poll(); });
  void poll();
})();
