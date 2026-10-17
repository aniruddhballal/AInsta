(() => {
  "use strict";

  const STORAGE_KEY = "finsta-instagram-about-collector-v1";
  const REPORT_NAME = "bot-account-info.html";
  const NOT_SHOWN = "Not shown";
  // Keep the first run small while the selectors are being verified. Remove
  // .slice(0, 6) after a successful test run to process the full list.
  const URLS = [
    "https://www.instagram.com/filmrollstoriess/",
    "https://www.instagram.com/pichypeapp/",
    "https://www.instagram.com/edlt.shox/",
    "https://www.instagram.com/vviennteru/",
    "https://www.instagram.com/vlad.aep_/",
    "https://www.instagram.com/anngry_birrds/",
    "https://www.instagram.com/hnvx.07/",
    "https://www.instagram.com/memesprcaf/",
    "https://www.instagram.com/2xamca/",
    "https://www.instagram.com/goofybara777/",
    "https://www.instagram.com/hezciv/",
    "https://www.instagram.com/z4rxk0/",
    "https://www.instagram.com/slleep91/",
    "https://www.instagram.com/mugiwaramemez/",
    "https://www.instagram.com/xkenshutsu/",
    "https://www.instagram.com/gzfr/",
    "https://www.instagram.com/uz87b/",
    "https://www.instagram.com/luffytheegear5/",
    "https://www.instagram.com/yapbaaz_/",
    "https://www.instagram.com/prime_senchui/",
    "https://www.instagram.com/ft.neyz/",
    "https://www.instagram.com/camilaboucheryamamoto/",
    "https://www.instagram.com/raffater7/",
    "https://www.instagram.com/starson.ig/",
    "https://www.instagram.com/reelrestock/",
    "https://www.instagram.com/onlyhi_story_/"
  ].slice(0, 6);

  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
    } catch (_error) {
      return null;
    }
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function usernameFromUrl(url) {
    return new URL(url).pathname.split("/").filter(Boolean)[0] || "";
  }

  function cleanText(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function linesFrom(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function normalized(value) {
    return cleanText(value).toLocaleLowerCase().replace(/:$/, "");
  }

  function currentProfileUrl() {
    const username = location.pathname.split("/").filter(Boolean)[0];
    return username ? `https://www.instagram.com/${username}/` : "";
  }

  function visible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function clickableElements(root = document) {
    return [...root.querySelectorAll("button, [role='button'], [role='menuitem'], [tabindex='0'], a")]
      .filter(visible);
  }

  function elementLabel(element) {
    return cleanText([
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.innerText,
      element.textContent
    ].filter(Boolean).join(" "));
  }

  function findOptionsButton() {
    const candidates = clickableElements(document.querySelector("main") || document);
    const exact = candidates.find((element) => /^(options|more options|profile options)$/i.test(elementLabel(element)));
    if (exact) return exact;
    return candidates.find((element) => /\b(options|more options)\b/i.test(elementLabel(element))) || null;
  }

  function findAboutMenuItem() {
    const candidates = clickableElements(document);
    return candidates.find((element) => {
      const label = elementLabel(element);
      return /about this account|about this profile/i.test(label);
    }) || null;
  }

  function aboutDialogText() {
    // Do not treat the options menu as the dialog. The actual account dialog
    // must contain at least one of Instagram's account-information labels.
    const candidates = [...document.querySelectorAll("body *")]
      .filter(visible)
      .map((element) => element.innerText || "")
      .filter((text) => {
        const value = normalized(text);
        return value.includes("about this account") &&
          (value.includes("date joined") || value.includes("account based in"));
      })
      .sort((left, right) => left.length - right.length);
    return candidates[0] || "";
  }

  function findBioExpandButton() {
    const header = document.querySelector("main header");
    if (!header) return null;
    return clickableElements(header).find((element) => {
      const label = cleanText(element.innerText || element.getAttribute("aria-label") || "");
      return /^(more|see translation)$/i.test(label);
    }) || null;
  }

  async function expandBio() {
    // Long bios are initially collapsed behind a visible “more” control.
    // Repeat once in case Instagram renders the control after the first click.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const button = findBioExpandButton();
      if (!button) return;
      button.click();
      await sleep(600);
    }
  }

  function extractLabelValue(text, label) {
    const lines = linesFrom(text);
    const wanted = normalized(label);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const normalizedLine = normalized(line);
      if (normalizedLine !== wanted) {
        const inline = line.match(new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:\\-]?\\s*(.+)$`, "i"));
        if (inline && inline[1]) return inline[1].trim();
        continue;
      }
      for (const candidate of lines.slice(index + 1, index + 4)) {
        if (!["date joined", "account based in", "former usernames"].includes(normalized(candidate))) {
          return candidate;
        }
      }
    }
    return NOT_SHOWN;
  }

  function profileText() {
    const header = document.querySelector("main header");
    return (header || document.querySelector("main") || document.body).innerText || "";
  }

  function extractBio(text, username) {
    const lines = linesFrom(text);
    const statPattern = /\b(followers?|following|posts?)\b/i;
    const statsIndex = lines.findIndex((line) => statPattern.test(line));
    if (statsIndex < 0) return NOT_SHOWN;

    const stopWords = new Set([
      "follow", "following", "message", "edit profile", "share profile",
      "posts", "reels", "tagged", "more", "see translation", "contact"
    ]);
    const candidates = [];
    for (const line of lines.slice(statsIndex + 1)) {
      const value = normalized(line);
      if (stopWords.has(value)) break;
      if (value === normalized(username) || statPattern.test(line)) continue;
      candidates.push(line);
    }
    return candidates.join("\n") || NOT_SHOWN;
  }

  async function waitFor(getValue, timeout = 10000, interval = 250) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = getValue();
      if (value) return value;
      await sleep(interval);
    }
    return null;
  }

  function updatePanel(message) {
    const panel = document.getElementById("finsta-collector-panel");
    if (panel) panel.querySelector("[data-status]").textContent = message;
  }

  function resultFor(url, status, profile = "", about = "") {
    const username = usernameFromUrl(url);
    return {
      url,
      username,
      bio: extractBio(profile, username),
      country: extractLabelValue(about, "Account based in"),
      date_joined: extractLabelValue(about, "Date joined"),
      status,
      profile_text: profile,
      about_text: about
    };
  }

  async function collectCurrent(url) {
    updatePanel(`Reading @${usernameFromUrl(url)}…`);
    await expandBio();
    const profile = profileText();
    const options = await waitFor(findOptionsButton);
    if (!options) return resultFor(url, "Could not find profile options", profile);

    options.click();
    const aboutItem = await waitFor(findAboutMenuItem);
    if (!aboutItem) return resultFor(url, "Could not find About this account", profile);

    aboutItem.click();
    let about = await waitFor(aboutDialogText, 15000, 300);

    // A delayed React transition can leave the menu visible after the first
    // synthetic click. Retry the same menu item once, then wait again.
    if (!about) {
      const retryItem = findAboutMenuItem();
      if (retryItem) {
        retryItem.click();
        about = await waitFor(aboutDialogText, 15000, 300);
      }
    }
    if (!about) return resultFor(url, "About this account dialog did not open", profile);

    return resultFor(url, "Collected", profile, about);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderReport(results) {
    const generated = new Date().toLocaleString();
    const rows = results.map((result, index) => {
      const bio = escapeHtml(result.bio).replace(/\n/g, "<br>");
      return `<tr><td>${index + 1}</td><td><a href="${escapeHtml(result.url)}" target="_blank" rel="noreferrer">${escapeHtml(result.url)}</a></td><td>${escapeHtml(result.username)}</td><td class="bio">${bio}</td><td>${escapeHtml(result.country)}</td><td>${escapeHtml(result.date_joined)}</td><td>${escapeHtml(result.status)}</td><td><details><summary>Profile text</summary><pre>${escapeHtml(result.profile_text || "No profile text captured.")}</pre></details><details><summary>About text</summary><pre>${escapeHtml(result.about_text || "No About this account text captured.")}</pre></details></td></tr>`;
    }).join("");

    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Instagram Bot Account Information</title><style>:root{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#172033;background:#f5f7fb}body{margin:0;padding:2rem}main{max-width:1500px;margin:0 auto}h1{margin:0 0 .35rem}.meta{color:#536079;margin:0 0 1.25rem}.table-wrap{overflow-x:auto;background:#fff;border:1px solid #dce2ee;border-radius:12px;box-shadow:0 4px 18px #1c2b4a12}table{width:100%;min-width:1300px;border-collapse:collapse}th,td{padding:.75rem .9rem;text-align:left;vertical-align:top;border-bottom:1px solid #e8ecf3}th{background:#eef2f8;color:#33415d;font-size:.9rem}tr:last-child td{border-bottom:0}a{color:#2457c5;word-break:break-all}.bio{white-space:pre-wrap;max-width:28rem;overflow-wrap:anywhere}pre{white-space:pre-wrap;max-width:32rem}details{min-width:8rem;margin-bottom:.35rem}</style></head><body><main><h1>Instagram bot account information</h1><p class="meta">Generated: ${escapeHtml(generated)} | Rows: ${results.length} | Fields: Bio, Account based in, and Date joined.</p><div class="table-wrap"><table><thead><tr><th>#</th><th>Account URL</th><th>Username</th><th>Bio</th><th>Account based in</th><th>Date joined</th><th>Status</th><th>Captured text</th></tr></thead><tbody>${rows}</tbody></table></div></main></body></html>`;
  }

  function downloadReport(results) {
    const blob = new Blob([renderReport(results)], { type: "text/html;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = REPORT_NAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  }

  async function runCollector() {
    if (window.__finstaCollectorRunning) return;
    window.__finstaCollectorRunning = true;
    try {
      let state = readState();
      if (!state || !state.active) return;

      const expected = URLS[state.index];
      if (!expected || currentProfileUrl() !== expected) {
        updatePanel(`Waiting for Firefox to open profile ${state.index + 1}/${URLS.length}…`);
        return;
      }

      const result = await collectCurrent(expected);
      state.results.push(result);
      state.index += 1;
      writeState(state);
      updatePanel(`${result.status}: ${state.index}/${URLS.length}`);

      if (state.index >= URLS.length) {
        state.active = false;
        writeState(state);
        downloadReport(state.results);
        updatePanel(`Finished. Downloaded ${REPORT_NAME}.`);
        return;
      }

      await sleep(1200);
      location.href = URLS[state.index];
    } finally {
      window.__finstaCollectorRunning = false;
    }
  }

  function addPanel() {
    if (document.getElementById("finsta-collector-panel")) return;
    const panel = document.createElement("aside");
    panel.id = "finsta-collector-panel";
    panel.innerHTML = `<strong>Finsta collector</strong><span data-status>Ready — ${URLS.length} profiles loaded</span><button data-start>Start / restart</button><button data-stop>Stop</button>`;
    Object.assign(panel.style, {
      position: "fixed", right: "16px", bottom: "16px", zIndex: "2147483647",
      display: "grid", gap: "8px", width: "230px", padding: "12px", color: "#172033",
      background: "#fff", border: "1px solid #ccd5e5", borderRadius: "10px",
      boxShadow: "0 5px 24px #0003", font: "14px system-ui, sans-serif"
    });
    panel.querySelectorAll("button").forEach((button) => Object.assign(button.style, {
      padding: "7px 9px", border: "1px solid #b9c4d8", borderRadius: "6px", cursor: "pointer", background: "#f3f6fb"
    }));
    panel.querySelector("[data-start]").addEventListener("click", () => {
      writeState({ active: true, index: 0, results: [], started_at: new Date().toISOString() });
      location.href = URLS[0];
    });
    panel.querySelector("[data-stop]").addEventListener("click", () => {
      const state = readState() || { index: 0, results: [] };
      state.active = false;
      writeState(state);
      updatePanel(`Stopped at ${state.index}/${URLS.length}.`);
    });
    document.documentElement.appendChild(panel);
  }

  addPanel();
  const state = readState();
  if (state && state.active) {
    setTimeout(runCollector, 1200);
  }
})();
