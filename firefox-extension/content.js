(() => {
  "use strict";

  const STORAGE_KEY = "ainsta-profile-catalog-v2";
  const REPORT_NAME = "bot-account-info.html";
  const DATA_NAME = "bot-account-info.json";
  const BOTS_FILE_NAME = "bots.md";
  const UI_MINIMIZED_KEY = "ainsta-panel-minimized";
  const UI_POSITION_KEY = "ainsta-panel-position";
  const NOT_SHOWN = "Not shown";
  const RESERVED_PATHS = new Set([
    "accounts", "community", "direct", "directory", "emails", "explore", "picture", "reels",
    "reel", "p", "press", "privacy", "session", "stories", "web"
  ]);

  // These are the existing profiles from bots.md. They are seeded only when
  // the catalog is first created; new profiles are added from the panel.
  const INITIAL_URLS = [
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
  ];

  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function now() {
    return new Date().toISOString();
  }

  function cleanText(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function normalized(value) {
    return cleanText(value).toLocaleLowerCase().replace(/:$/, "");
  }

  function linesFrom(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function normalizeProfileUrl(value) {
    try {
      const parsed = new URL(value, location.origin);
      const hostname = parsed.hostname.toLocaleLowerCase();
      const isInstagramHost = hostname === "instagram.com" || hostname.endsWith(".instagram.com");
      if (!/^https?:$/.test(parsed.protocol) || !isInstagramHost) return null;
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length !== 1 || RESERVED_PATHS.has(parts[0].toLocaleLowerCase())) return null;
      const username = parts[0];
      return {
        key: username.toLocaleLowerCase(),
        username,
        url: `https://www.instagram.com/${username}/`
      };
    } catch (_error) {
      return null;
    }
  }

  function currentProfile() {
    return normalizeProfileUrl(location.href);
  }

  function makeProfile(value, timestamp = now()) {
    const profile = typeof value === "string" ? normalizeProfileUrl(value) : value;
    if (!profile) return null;
    return {
      key: profile.key,
      url: profile.url,
      username: profile.username,
      added_at: timestamp,
      last_fetched_at: null,
      ignored: false,
      status: "pending",
      last_error: "",
      bio: NOT_SHOWN,
      country: NOT_SHOWN,
      date_joined: NOT_SHOWN,
      posts_count: NOT_SHOWN,
      post_urls: [],
      post_dates: [],
      profile_text: "",
      about_text: ""
    };
  }

  function createInitialState() {
    const timestamp = now();
    const profiles = INITIAL_URLS.map((url) => makeProfile(url, timestamp)).filter(Boolean);
    return { version: 2, profiles, run: null };
  }

  function migrateLegacyState() {
    const state = createInitialState();
    try {
      const legacy = JSON.parse(localStorage.getItem("ainsta-instagram-about-collector-v1") || "null");
      if (!legacy || !Array.isArray(legacy.results)) return state;
      for (const result of legacy.results) {
        const profile = normalizeProfileUrl(result.url);
        if (!profile) continue;
        let saved = findProfile(state, profile.key);
        if (!saved) {
          saved = makeProfile(profile);
          state.profiles.push(saved);
        }
        if (result.status === "Collected") {
          Object.assign(saved, {
            bio: result.bio || NOT_SHOWN,
            country: result.country || NOT_SHOWN,
            date_joined: result.date_joined || NOT_SHOWN,
            status: "collected",
            last_error: "",
            profile_text: result.profile_text || "",
            about_text: result.about_text || "",
            last_fetched_at: legacy.completed_at || now()
          });
        }
      }
    } catch (_error) {
      // If the old state is malformed, start with the seeded catalog.
    }
    return state;
  }

  function writeState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const initial = migrateLegacyState();
        writeState(initial);
        return initial;
      }
      const state = JSON.parse(raw);
      if (state && state.version === 2 && Array.isArray(state.profiles)) return state;
    } catch (_error) {
      // Recreate a usable catalog if local storage contains invalid data.
    }
    const initial = migrateLegacyState();
    writeState(initial);
    return initial;
  }

  function findProfile(state, key) {
    return state.profiles.find((profile) => profile.key === key) || null;
  }

  function pendingProfiles(state) {
    return state.profiles.filter((profile) => !profile.ignored && (!profile.last_fetched_at || String(profile.status).toLocaleLowerCase() !== "collected"));
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
    return clickableElements(document).find((element) =>
      /about this account|about this profile/i.test(elementLabel(element))
    ) || null;
  }

  function aboutDialogText() {
    // The options menu can also have aria-modal set. Require the actual
    // account-information labels before accepting anything as the dialog.
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
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const button = findBioExpandButton();
      if (!button) return;
      button.click();
      await sleep(600);
    }
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

  function extractLabelValue(text, label) {
    const lines = linesFrom(text);
    const wanted = normalized(label);
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (normalized(line) !== wanted) {
        const inline = line.match(new RegExp(`${escapedLabel}\\s*[:\\-]?\\s*(.+)$`, "i"));
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

  function extractBio(profileText, username) {
    const lines = linesFrom(profileText);
    if (!lines.length) return NOT_SHOWN;
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

  function profileText() {
    const header = document.querySelector("main header");
    return (header || document.querySelector("main") || document.body).innerText || "";
  }

  function extractPostsCount(text) {
    const match = String(text || "").match(/([\d.,]+\s*[KMB]?)\s+posts?\b/i);
    return match ? match[1].replace(/\s+/g, "") : NOT_SHOWN;
  }

  function collectPostUrls() {
    const urls = new Set();
    for (const anchor of document.querySelectorAll("main a[href]")) {
      try {
        const url = new URL(anchor.href, location.origin);
        if (!/^\/(p|reel|tv)\/[^/]+\/?$/.test(url.pathname)) continue;
        urls.add(`https://www.instagram.com${url.pathname}`);
      } catch (_error) {
        // Ignore malformed or non-post links.
      }
    }
    return [...urls];
  }

  async function collectAllPostUrls() {
    const urls = new Set(collectPostUrls());
    let previousHeight = 0;
    let stableBottomPasses = 0;
    for (let pass = 0; pass < 500 && stableBottomPasses < 5; pass += 1) {
      const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      window.scrollTo(0, height);
      await sleep(650);
      collectPostUrls().forEach((url) => urls.add(url));
      const nextHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      if (nextHeight <= height && nextHeight === previousHeight) stableBottomPasses += 1;
      else stableBottomPasses = 0;
      previousHeight = nextHeight;
    }
    window.scrollTo(0, 0);
    return [...urls];
  }

  async function collectPostDate() {
    const time = await waitFor(() => {
      const candidates = [...document.querySelectorAll("main time[datetime], article time[datetime], time[datetime]")];
      return candidates.find((item) => !Number.isNaN(Date.parse(item.dateTime || item.getAttribute("datetime")))) || null;
    }, 12000, 300);
    return time ? new Date(time.dateTime || time.getAttribute("datetime")).toISOString() : NOT_SHOWN;
  }

  function collectionIssue(profile, code, message, postUrl = "") {
    return {
      code,
      message,
      profile_url: profile.url,
      post_url: postUrl || null,
      occurred_at: now(),
      recommended_action: "Use MARK CURRENT FOR REFRESH to retry, or IGNORE CURRENT PROFILE to exclude this profile from future runs."
    };
  }

  function resultFor(profile, status, capturedProfile = "", about = "", error = "", postUrls = []) {
    const postsCount = extractPostsCount(capturedProfile);
    const collectionIssues = [];
    if (postsCount === NOT_SHOWN) {
      collectionIssues.push(collectionIssue(profile, "POST_COUNT_UNAVAILABLE", "The displayed post count could not be identified in the profile header."));
    }
    if (status !== "Collected") {
      const code = status === "Deleted account" ? "ACCOUNT_UNAVAILABLE" : "PROFILE_COLLECTION_FAILED";
      collectionIssues.push(collectionIssue(profile, code, error || status));
    }
    if (postsCount !== NOT_SHOWN && !/^0(?:[.,]0+)?$/.test(postsCount) && postUrls.length === 0) {
      collectionIssues.push(collectionIssue(profile, "POST_LINKS_UNAVAILABLE", "A post count was shown, but no post links were found while scrolling the profile."));
    }
    return {
      bio: extractBio(capturedProfile, profile.username),
      country: extractLabelValue(about, "Account based in"),
      date_joined: extractLabelValue(about, "Date joined"),
      posts_count: postsCount,
      post_urls: postUrls,
      collection_issues: collectionIssues,
      status,
      last_error: error,
      profile_text: capturedProfile,
      about_text: about
    };
  }

  function isUnavailableProfileText(text) {
    return /page isn['’]t available|page may have been removed/i.test(text || "");
  }

  async function collectCurrent(profile) {
    updatePanel(`Reading @${profile.username}…`);
    await expandBio();
    const capturedProfile = profileText();
    updatePanel(`Finding posts for @${profile.username}…`);
    const postUrls = await collectAllPostUrls();
    const options = await waitFor(findOptionsButton);
    if (!options) {
      if (isUnavailableProfileText(capturedProfile)) return resultFor(profile, "Deleted account", capturedProfile, "", "", postUrls);
      return resultFor(profile, "Could not find profile options", capturedProfile, "", "Profile options not found", postUrls);
    }

    options.click();
    const aboutItem = await waitFor(findAboutMenuItem);
    if (!aboutItem) return resultFor(profile, "Could not find About this account", capturedProfile, "", "About menu item not found", postUrls);

    aboutItem.click();
    let about = await waitFor(aboutDialogText, 15000, 300);
    if (!about) {
      const retryItem = findAboutMenuItem();
      if (retryItem) {
        retryItem.click();
        about = await waitFor(aboutDialogText, 15000, 300);
      }
    }
    if (!about) return resultFor(profile, "About this account dialog did not open", capturedProfile, "", "Account dialog did not contain expected fields", postUrls);

    return resultFor(profile, "Collected", capturedProfile, about, "", postUrls);
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  }

  function downloadReport() {
    downloadFile(REPORT_NAME, renderReport(), "text/html;charset=utf-8");
  }

  function renderReport() {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Instagram Bot Account Information</title><style>:root{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#172033;background:#f5f7fb}body{margin:0;padding:2rem}main{max-width:1800px;margin:0 auto}h1{margin:0 0 .35rem}.meta{color:#536079;margin:.6rem 0 1.25rem}.load,.issues{padding:1rem;background:#fff;border:1px solid #dce2ee;border-radius:12px;margin:1rem 0}.table-wrap{overflow-x:auto;background:#fff;border:1px solid #dce2ee;border-radius:12px;box-shadow:0 4px 18px #1c2b4a12}table{width:100%;min-width:1900px;border-collapse:collapse}th,td{padding:.75rem .9rem;text-align:left;vertical-align:top;border-bottom:1px solid #e8ecf3}th{background:#eef2f8;color:#33415d;font-size:.9rem}tr:last-child td{border-bottom:0}a{color:#2457c5;word-break:break-all}.bio{white-space:pre-wrap;max-width:28rem;overflow-wrap:anywhere}pre{white-space:pre-wrap;max-width:32rem}details{min-width:8rem;margin-bottom:.35rem}ul{padding-left:1.2rem;max-width:50rem}li{margin-bottom:.35rem}.error{color:#8b1e1e}</style></head><body><main><h1>Instagram bot account information</h1><section class="load"><label for="data-file">Choose bot-account-info.json:</label> <input id="data-file" type="file" accept=".json,application/json"><p>Choose the latest JSON export to view its records.</p></section><p id="meta" class="meta">No data loaded.</p><p id="error" class="error" role="alert"></p><section class="issues"><h2>Collection issues</h2><p id="issue-meta">No data loaded.</p><ul id="issues"></ul></section><div class="table-wrap"><table><thead><tr><th>#</th><th>Account URL</th><th>Username</th><th>Bio</th><th>Posts</th><th>Post dates</th><th>Account based in</th><th>Date joined</th><th>Status</th><th>Added</th><th>Last fetched</th><th>Captured text</th></tr></thead><tbody id="rows"></tbody></table></div></main><script>
const input=document.getElementById("data-file"),rows=document.getElementById("rows"),meta=document.getElementById("meta"),error=document.getElementById("error"),issuesNode=document.getElementById("issues"),issueMeta=document.getElementById("issue-meta");
function cell(row,value,className){const td=document.createElement("td");td.textContent=value==null?"":String(value);if(className)td.className=className;row.appendChild(td);return td}
function link(value){const a=document.createElement("a");a.textContent=value||"";try{const u=new URL(value);if(u.protocol==="https:"&&u.hostname==="www.instagram.com"){a.href=u.href;a.target="_blank";a.rel="noreferrer"}}catch(_){}return a}
function details(summary,content){const d=document.createElement("details"),s=document.createElement("summary");s.textContent=summary;d.append(s,content);return d}
function pre(value){const p=document.createElement("pre");p.textContent=value||"";return p}
function render(data){if(!data||!Array.isArray(data.profiles))throw new Error("This JSON file does not contain a profiles list.");rows.replaceChildren();data.profiles.forEach((p,i)=>{const tr=document.createElement("tr");cell(tr,i+1);const urlCell=cell(tr,"");urlCell.appendChild(link(p.url));cell(tr,p.username);cell(tr,p.bio,"bio");cell(tr,p.posts_count);const postCell=cell(tr,"");const list=document.createElement("ul");(Array.isArray(p.post_dates)?p.post_dates:[]).forEach(item=>{const li=document.createElement("li");li.append(link(item.url),document.createTextNode(" - "+(item.date||"Not shown")));list.appendChild(li)});postCell.appendChild(details((p.post_dates||[]).length+" post dates",list));cell(tr,p.country);cell(tr,p.date_joined);const statusCell=cell(tr,"");statusCell.append(document.createTextNode((p.status||"")+(p.ignored?" (ignored)":"")));if(p.last_error){statusCell.appendChild(document.createElement("br"));const small=document.createElement("small");small.textContent=p.last_error;statusCell.appendChild(small)}cell(tr,p.added_at);cell(tr,p.last_fetched_at||"Not fetched");const captured=cell(tr,"");captured.append(details("Profile text",pre(p.profile_text||"No profile text captured.")),details("About text",pre(p.about_text||"No About this account text captured.")));rows.appendChild(tr)});const issues=Array.isArray(data.issues)?data.issues:data.profiles.reduce((all,p)=>all.concat((p.collection_issues||[]).map(issue=>Object.assign({username:p.username},issue))),[]);issuesNode.replaceChildren();issueMeta.textContent=issues.length?issues.length+" issue(s) found. Review each entry and refresh or ignore the affected profile.":"No collection issues recorded.";issues.forEach(issue=>{const li=document.createElement("li");li.append(document.createTextNode((issue.username?"@"+issue.username:"Profile")+" - "+(issue.code||"Issue")+": "+(issue.message||"Details unavailable.")));if(issue.profile_url)li.append(document.createTextNode(" "),link(issue.profile_url));if(issue.post_url)li.append(document.createTextNode(" | Post: "),link(issue.post_url));if(issue.recommended_action)li.append(document.createTextNode(" | "+issue.recommended_action));issuesNode.appendChild(li)});meta.textContent="Generated: "+(data.generated_at||"Unknown")+" | Rows: "+data.profiles.length+" | Issues: "+issues.length+" | Fields: Bio, Posts, post dates, Account based in, Date joined, Added, and Last fetched."}
input.addEventListener("change",async()=>{error.textContent="";const file=input.files&&input.files[0];if(!file)return;try{render(JSON.parse(await file.text()))}catch(e){rows.replaceChildren();issuesNode.replaceChildren();meta.textContent="No data loaded.";issueMeta.textContent="No data loaded.";error.textContent="Could not read data file: "+e.message}});
</script></body></html>`;
  }
  function downloadData(state) {
    const issues = state.profiles.reduce((all, profile) => all.concat(
      (profile.collection_issues || []).map((issue) => ({ ...issue, username: profile.username }))
    ), []);
    const data = { format: "ainsta-bot-account-info", version: 1, generated_at: now(), profiles: state.profiles, issues };
    downloadFile(DATA_NAME, `${JSON.stringify(data, null, 2)}\n`, "application/json;charset=utf-8");
  }

  function downloadBotsFile(state) {
    const content = `${state.profiles.map((profile) => profile.url).join("\n")}\n`;
    downloadFile(BOTS_FILE_NAME, content, "text/markdown;charset=utf-8");
  }

  function setButtonStyle(button, background, border, color = "#ffffff") {
    Object.assign(button.style, {
      padding: "8px 9px", borderRadius: "6px", cursor: "pointer",
      font: "600 12px system-ui, sans-serif", textAlign: "center"
    });
    button.style.setProperty("background", background, "important");
    button.style.setProperty("border", border, "important");
    button.style.setProperty("color", color, "important");
  }

  function setPanelMinimized(minimized) {
    const panel = document.getElementById("ainsta-collector-panel");
    if (!panel) return;
    const body = panel.querySelector("[data-body]");
    const header = panel.querySelector("[data-header]");
    const title = header.querySelector("strong");
    const toggle = panel.querySelector("[data-toggle]");
    localStorage.setItem(UI_MINIMIZED_KEY, minimized ? "true" : "false");
    panel.dataset.minimized = minimized ? "true" : "false";
    body.style.display = minimized ? "none" : "grid";
    panel.style.width = minimized ? "36px" : "270px";
    panel.style.height = minimized ? "36px" : "auto";
    panel.style.padding = minimized ? "0" : "13px";
    header.style.paddingBottom = minimized ? "0" : "10px";
    header.style.borderBottom = minimized ? "none" : "1px solid #000000";
    header.style.justifyContent = minimized ? "center" : "space-between";
    title.style.display = minimized ? "none" : "block";
    toggle.textContent = minimized ? "" : "MINIMIZE";
    toggle.style.width = minimized ? "36px" : "auto";
    toggle.style.height = minimized ? "36px" : "auto";
    toggle.style.padding = minimized ? "0" : "3px 7px";
    toggle.style.borderRadius = "0";
    toggle.style.setProperty("background", "#ffffff", "important");
    toggle.style.setProperty("color", "#000000", "important");
    toggle.style.setProperty("border", "1px solid #000000", "important");
    toggle.setAttribute("aria-label", minimized ? "Restore AInsta collector" : "Minimize AInsta collector");
    toggle.title = minimized ? "Restore collector" : "Minimize collector";
    const rect = panel.getBoundingClientRect();
    setPanelPosition(panel, rect.left, rect.top);
  }

  function setPanelPosition(panel, left, top, save = true) {
    const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
    const nextLeft = Math.max(0, Math.min(Math.round(left), maxLeft));
    const nextTop = Math.max(0, Math.min(Math.round(top), maxTop));
    panel.style.left = `${nextLeft}px`;
    panel.style.top = `${nextTop}px`;
    if (save) localStorage.setItem(UI_POSITION_KEY, JSON.stringify({ left: nextLeft, top: nextTop }));
  }

  function restorePanelPosition(panel) {
    try {
      const saved = JSON.parse(localStorage.getItem(UI_POSITION_KEY) || "null");
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        setPanelPosition(panel, saved.left, saved.top, false);
        return;
      }
    } catch (_error) {
      // Use the default top-left position when the saved position is invalid.
    }
    setPanelPosition(panel, 16, 16, false);
  }

  function makePanelDraggable(panel) {
    const header = panel.querySelector("[data-header]");
    let drag = null;
    header.style.cursor = "grab";
    header.style.userSelect = "none";
    header.style.setProperty("touch-action", "none", "important");

    header.addEventListener("pointerdown", (event) => {
      const minimized = panel.dataset.minimized === "true";
      if (!minimized && event.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      drag = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        onToggle: Boolean(event.target.closest("[data-toggle]"))
      };
      header.setPointerCapture(event.pointerId);
      header.style.cursor = "grabbing";
    });

    header.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;
      setPanelPosition(panel, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    });

    const stopDragging = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const clickedToggle = drag.onToggle && !drag.moved && panel.dataset.minimized === "true";
      if (drag.moved || clickedToggle) panel.dataset.suppressToggleClick = "true";
      drag = null;
      header.style.cursor = "grab";
      if (header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId);
      if (clickedToggle) setPanelMinimized(false);
    };
    header.addEventListener("pointerup", stopDragging);
    header.addEventListener("pointercancel", stopDragging);
    window.addEventListener("resize", () => {
      const rect = panel.getBoundingClientRect();
      setPanelPosition(panel, rect.left, rect.top);
    });
  }

  function updatePanel(message = "") {
    const panel = document.getElementById("ainsta-collector-panel");
    if (!panel) return;
    const state = readState();
    const current = currentProfile();
    const saved = current ? findProfile(state, current.key) : null;
    const pending = pendingProfiles(state).length;
    const currentNode = panel.querySelector("[data-current]");
    const countNode = panel.querySelector("[data-count]");
    const statusNode = panel.querySelector("[data-status]");
    const addButton = panel.querySelector("[data-add]");
    const refreshButton = panel.querySelector("[data-refresh]");
    const runButton = panel.querySelector("[data-run]");

    currentNode.textContent = current
      ? `Current: @${current.username} — ${saved ? "saved" : "not saved"}`
      : "Open a profile to add it";
    countNode.textContent = `Saved: ${state.profiles.length} · Pending: ${pending}`;
    addButton.style.display = current ? "block" : "none";
    refreshButton.style.display = saved ? "block" : "none";
    addButton.textContent = saved ? "ALREADY SAVED" : "ADD CURRENT PROFILE";
    runButton.textContent = `RUN PENDING PROFILES (${pending})`;

    if (state.run && state.run.active) {
      const position = Math.min(state.run.index + 1, state.run.queue.length);
      statusNode.textContent = message || `Collecting ${position}/${state.run.queue.length}…`;
    } else {
      statusNode.textContent = message || "Ready";
    }
  }

  function addCurrentProfile() {
    const current = currentProfile();
    if (!current) return updatePanel("Open an individual profile first.");
    const state = readState();
    if (findProfile(state, current.key)) return updatePanel(`@${current.username} is already saved.`);
    state.profiles.push(makeProfile(current));
    writeState(state);
    updatePanel(`Added @${current.username} without creating a duplicate.`);
  }

  function refreshCurrentProfile() {
    const current = currentProfile();
    const state = readState();
    const profile = current && findProfile(state, current.key);
    if (!profile) return updatePanel("Save this profile before marking it for refresh.");
    profile.ignored = false;
    profile.last_fetched_at = null;
    profile.status = "pending";
    profile.last_error = "";
    writeState(state);
    updatePanel(`@${profile.username} is marked for refresh.`);
  }

  function ignoreCurrentProfile() {
    const current = currentProfile();
    const state = readState();
    const profile = current && findProfile(state, current.key);
    if (!profile) return updatePanel("Save this profile before ignoring it.");
    if (state.run && state.run.active) return updatePanel("Stop the active run before ignoring a profile.");
    profile.ignored = true;
    writeState(state);
    updatePanel(`@${profile.username} will be skipped in future runs. Mark it for refresh to include it again.`);
  }

  function startRun() {
    const state = readState();
    const queue = pendingProfiles(state).map((profile) => profile.key);
    if (!queue.length) return updatePanel("Nothing pending. Add a profile or mark one for refresh.");
    state.run = { active: true, queue, index: 0, phase: "profile", post_index: 0, started_at: now() };
    writeState(state);
    updatePanel(`Starting ${queue.length} pending profile${queue.length === 1 ? "" : "s"}…`);
    navigateToRunTarget();
  }

  function stopRun() {
    const state = readState();
    if (state.run) state.run.active = false;
    writeState(state);
    updatePanel("Collector stopped. Collected profiles remain saved.");
  }

  function navigateToRunTarget() {
    const state = readState();
    if (!state.run || !state.run.active) return;
    const expected = state.run.queue[state.run.index];
    const target = findProfile(state, expected);
    if (!target) return updatePanel("The queued profile no longer exists.");
    const targetUrl = state.run.phase === "posts"
      ? (target.post_urls || [])[state.run.post_index]
      : target.url;
    if (!targetUrl && state.run.phase === "posts") {
      state.run.phase = "profile";
      state.run.post_index = 0;
      state.run.index += 1;
      writeState(state);
      if (state.run.index >= state.run.queue.length) {
        state.run.active = false;
        writeState(state);
        downloadData(state);
        updatePanel(`Finished. Downloaded ${DATA_NAME}.`);
      } else {
        setTimeout(navigateToRunTarget, 0);
      }
      return;
    }
    if (!targetUrl) return updatePanel("The queued profile has no target URL.");
    if (location.href.split("?")[0].replace(/\/$/, "") !== targetUrl.replace(/\/$/, "")) {
      updatePanel(state.run.phase === "posts"
        ? `Opening post ${state.run.post_index + 1}/${(target.post_urls || []).length} for @${target.username}…`
        : `Opening @${target.username} (${state.run.index + 1}/${state.run.queue.length})…`);
      location.href = targetUrl;
      return;
    }
    setTimeout(runCollector, 900);
  }

  async function runCollector() {
    if (window.__ainstaCollectorRunning) return;
    window.__ainstaCollectorRunning = true;
    try {
      let state = readState();
      if (!state.run || !state.run.active) return;
      const expectedKey = state.run.queue[state.run.index];
      const target = findProfile(state, expectedKey);
      if (!target) return updatePanel("Queued profile was not found in the catalog.");
      if (state.run.phase === "posts") {
        const expectedUrl = (target.post_urls || [])[state.run.post_index];
        if (!expectedUrl || !location.pathname.startsWith(new URL(expectedUrl).pathname)) return navigateToRunTarget();
        updatePanel(`Reading post date ${state.run.post_index + 1}/${target.post_urls.length} for @${target.username}…`);
        const date = await collectPostDate();
        state = readState();
        if (!state.run || !state.run.active) return updatePanel("Collector stopped before saving this post date.");
        const saved = findProfile(state, expectedKey);
        saved.post_dates = saved.post_dates || [];
        saved.post_dates.push({ url: expectedUrl, date });
        if (date === NOT_SHOWN) {
          saved.collection_issues = saved.collection_issues || [];
          saved.collection_issues.push(collectionIssue(saved, "POST_DATE_UNAVAILABLE", "Instagram did not expose a readable published timestamp for this post.", expectedUrl));
        }
        state.run.post_index += 1;
        if (state.run.post_index >= (saved.post_urls || []).length) {
          state.run.phase = "profile";
          state.run.post_index = 0;
          state.run.index += 1;
          if (saved.status === "Collected") saved.last_fetched_at = now();
          delete saved.post_urls;
        }
        writeState(state);
        if (state.run.index >= state.run.queue.length) {
          state.run.active = false;
          writeState(state);
          downloadData(state);
          updatePanel(`Finished. Downloaded ${DATA_NAME}.`);
          return;
        }
        await sleep(650);
        navigateToRunTarget();
        return;
      }
      const current = currentProfile();
      if (!current || current.key !== target.key) return navigateToRunTarget();

      const result = await collectCurrent(target);
      state = readState();
      if (!state.run || !state.run.active) return updatePanel("Collector stopped before saving this result.");
      const saved = findProfile(state, target.key);
      if (!saved) return updatePanel("Profile disappeared from the catalog.");
      Object.assign(saved, result);
      saved.post_dates = [];
      if (result.status === "Collected") {
        saved.last_fetched_at = saved.post_urls && saved.post_urls.length ? null : now();
        saved.last_error = "";
      } else {
        saved.last_fetched_at = null;
      }
      if (saved.post_urls && saved.post_urls.length) {
        state.run.phase = "posts";
        state.run.post_index = 0;
      } else {
        state.run.phase = "profile";
        state.run.index += 1;
      }

      if (state.run.phase === "profile" && state.run.index >= state.run.queue.length) {
        state.run.active = false;
        writeState(state);
        downloadData(state);
        updatePanel(`Finished. Downloaded ${DATA_NAME}.`);
        return;
      }

      writeState(state);
      updatePanel(state.run.phase === "posts"
        ? `${result.status}. Reading ${saved.post_urls.length} post dates for @${saved.username}…`
        : `${result.status}. Moving to ${state.run.index + 1}/${state.run.queue.length}…`);
      await sleep(900);
      navigateToRunTarget();
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      const state = readState();
      if (state.run && state.run.active) {
        const key = state.run.queue[state.run.index];
        const saved = findProfile(state, key);
        if (saved) {
          if (state.run.phase === "posts") {
            const postUrl = (saved.post_urls || [])[state.run.post_index];
            saved.post_dates = saved.post_dates || [];
            if (postUrl) {
              saved.post_dates.push({ url: postUrl, date: NOT_SHOWN });
              saved.collection_issues = saved.collection_issues || [];
              saved.collection_issues.push(collectionIssue(saved, "POST_DATE_READ_ERROR", message, postUrl));
            }
            state.run.post_index += 1;
            if (state.run.post_index >= (saved.post_urls || []).length) {
              state.run.phase = "profile";
              state.run.post_index = 0;
              state.run.index += 1;
              if (saved.status === "Collected") saved.last_fetched_at = now();
              delete saved.post_urls;
            }
          } else {
            saved.collection_issues = saved.collection_issues || [];
            saved.collection_issues.push(collectionIssue(saved, "PROFILE_READ_ERROR", message));
            saved.status = "Collection error";
            saved.last_error = message;
            saved.last_fetched_at = null;
            delete saved.post_urls;
            state.run.phase = "profile";
            state.run.index += 1;
          }
          writeState(state);
          if (state.run.index >= state.run.queue.length) {
            state.run.active = false;
            writeState(state);
            downloadData(state);
            updatePanel(`Finished with issues. Downloaded ${DATA_NAME}.`);
          } else {
            updatePanel(`Logged an issue for @${saved.username}; continuing the queue…`);
            setTimeout(navigateToRunTarget, 650);
          }
        } else {
          updatePanel(`Collector error: ${message}`);
        }
      } else {
        updatePanel(`Collector error: ${message}`);
      }
    } finally {
      window.__ainstaCollectorRunning = false;
    }
  }

  function addPanel() {
    if (document.getElementById("ainsta-collector-panel")) return;
    const panel = document.createElement("aside");
    panel.id = "ainsta-collector-panel";
    panel.innerHTML = `<div data-header><strong>AINSTA COLLECTOR</strong><button data-toggle>MINIMIZE</button></div><div data-body><span data-current>Open a profile to add it</span><span data-count></span><span data-status>Ready</span><button data-add>ADD CURRENT PROFILE</button><button data-refresh>MARK CURRENT FOR REFRESH</button><button data-ignore>IGNORE CURRENT PROFILE</button><button data-run>RUN PENDING PROFILES</button><button data-export>EXPORT BOTS.MD</button><button data-report>DOWNLOAD REPORT VIEWER</button><button data-json>DOWNLOAD DATA JSON</button><button data-stop>STOP COLLECTION</button></div>`;
    Object.assign(panel.style, {
      position: "fixed", left: "16px", top: "16px", zIndex: "2147483647",
      width: "270px", padding: "13px", color: "#000000",
      background: "#ffffff", border: "1px solid #000000", borderRadius: "0",
      boxShadow: "none", font: "14px Arial, sans-serif"
    });
    const header = panel.querySelector("[data-header]");
    const body = panel.querySelector("[data-body]");
    const toggle = panel.querySelector("[data-toggle]");
    Object.assign(header.style, {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: "12px", paddingBottom: "10px", borderBottom: "1px solid #000000"
    });
    Object.assign(body.style, { display: "grid", gap: "7px", paddingTop: "10px" });
    header.querySelector("strong").style.setProperty("color", "#000000", "important");
    header.querySelector("strong").style.setProperty("font-size", "16px", "important");
    header.querySelector("strong").style.setProperty("font-weight", "700", "important");
    header.querySelector("strong").style.setProperty("letter-spacing", "1px", "important");
    Object.assign(toggle.style, {
      padding: "3px 7px", borderRadius: "0", cursor: "pointer",
      font: "700 10px Arial, sans-serif", letterSpacing: "0.8px", background: "#ffffff"
    });
    toggle.style.setProperty("color", "#000000", "important");
    toggle.style.setProperty("border", "1px solid #000000", "important");
    panel.querySelectorAll("[data-current], [data-count], [data-status]").forEach((node) => {
      node.style.setProperty("color", "#555555", "important");
      node.style.setProperty("line-height", "1.35", "important");
    });
    setButtonStyle(panel.querySelector("[data-add]"), "#000000", "1px solid #000000");
    setButtonStyle(panel.querySelector("[data-refresh]"), "#ffffff", "1px solid #000000", "#000000");
    setButtonStyle(panel.querySelector("[data-ignore]"), "#ffffff", "1px solid #000000", "#000000");
    setButtonStyle(panel.querySelector("[data-run]"), "#000000", "1px solid #000000");
    setButtonStyle(panel.querySelector("[data-export]"), "#ffffff", "1px solid #000000", "#000000");
    setButtonStyle(panel.querySelector("[data-report]"), "#ffffff", "1px solid #000000", "#000000");
    setButtonStyle(panel.querySelector("[data-json]"), "#ffffff", "1px solid #000000", "#000000");
    setButtonStyle(panel.querySelector("[data-stop]"), "#ffffff", "1px solid #000000", "#000000");
    toggle.addEventListener("click", () => {
      if (panel.dataset.suppressToggleClick === "true") {
        delete panel.dataset.suppressToggleClick;
        return;
      }
      setPanelMinimized(panel.dataset.minimized !== "true");
    });
    panel.querySelector("[data-add]").addEventListener("click", addCurrentProfile);
    panel.querySelector("[data-refresh]").addEventListener("click", refreshCurrentProfile);
    panel.querySelector("[data-ignore]").addEventListener("click", ignoreCurrentProfile);
    panel.querySelector("[data-run]").addEventListener("click", startRun);
    panel.querySelector("[data-export]").addEventListener("click", () => downloadBotsFile(readState()));
    panel.querySelector("[data-report]").addEventListener("click", () => downloadReport());
    panel.querySelector("[data-json]").addEventListener("click", () => downloadData(readState()));
    panel.querySelector("[data-stop]").addEventListener("click", stopRun);
    document.documentElement.appendChild(panel);
    restorePanelPosition(panel);
    makePanelDraggable(panel);
    updatePanel();
    setPanelMinimized(localStorage.getItem(UI_MINIMIZED_KEY) === "true");
  }

  addPanel();
  const state = readState();
  if (state.run && state.run.active) setTimeout(navigateToRunTarget, 900);
})();
