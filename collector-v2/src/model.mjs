export const now = () => new Date().toISOString();
export const clean = (value) => String(value ?? '').replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').trim();

export function count(raw) {
  const match = clean(raw).replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i);
  if (!match) return null;
  const scale = { K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase()] || 1;
  const value = Math.round(Number(match[1]) * scale);
  return Number.isSafeInteger(value) ? { value, raw: clean(raw), approximate: scale !== 1 } : null;
}

function metric(text, names) {
  for (const name of names) {
    const forward = new RegExp(`(\\d[\\d,.]*\\s*[KMB]?)\\s+${name}\\b`, 'i').exec(text);
    const reverse = new RegExp(`${name}\\s*[:：]?\\s*(\\d[\\d,.]*\\s*[KMB]?)\\b`, 'i').exec(text);
    const parsed = count((forward || reverse)?.[1]);
    if (parsed) return parsed;
  }
  return null;
}

function afterLabel(text, label) {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const i = lines.findIndex((line) => line.toLowerCase() === label.toLowerCase());
  return i >= 0 && lines[i + 1] ? lines[i + 1] : null;
}

export function profileFromSnapshot(username, snapshot) {
  const header = snapshot.header_text || '';
  const lines = header.split(/\r?\n/).map(clean).filter(Boolean);
  const statIndex = lines.findIndex((line) => /\bposts?\b/i.test(line) && metric(line, ['posts?']));
  const bioStart = lines.findIndex((line) => /\bfollowing\b/i.test(line));
  const bioStop = lines.findIndex((line, i) => i > bioStart && /^(follow|following|message|edit profile|share profile|posts|reels|tagged)$/i.test(line));
  const bioLines = bioStart >= 0 ? lines.slice(bioStart + 1, bioStop >= 0 ? bioStop : undefined) : [];
  const about = snapshot.about_text || '';
  const former = afterLabel(about, 'Former usernames');
  return {
    username,
    url: `https://www.instagram.com/${username}/`,
    fetched_at: now(),
    display_name: statIndex > 1 ? lines.slice(1, statIndex).join(' ') : null,
    bio: bioLines.length ? bioLines.join('\n') : null,
    posts_count: metric(header, ['posts?']),
    followers_count: metric(header, ['followers?']),
    following_count: metric(header, ['following']),
    category: snapshot.category || null,
    profile_picture_url: snapshot.profile_picture_url || null,
    date_joined: afterLabel(about, 'Date joined'),
    account_based_in: afterLabel(about, 'Account based in'),
    former_usernames_count: count(former),
    raw: { header_text: header, about_text: about, description: snapshot.description || '' },
    issues: [
      ...(!header ? ['profile header unavailable'] : []),
      ...(!about ? ['About this account unavailable'] : [])
    ]
  };
}

export function canonicalItemUrl(href) {
  try {
    const url = new URL(href, 'https://www.instagram.com');
    if (!['www.instagram.com', 'instagram.com'].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/(p|reel|reels)\/([A-Za-z0-9_-]+)\/?$/);
    if (!match) return null;
    const kind = match[1] === 'p' ? 'post' : 'reel';
    return { kind, shortcode: match[2], url: `https://www.instagram.com/${kind === 'post' ? 'p' : 'reel'}/${match[2]}/` };
  } catch { return null; }
}

function jsonLdData(scripts) {
  for (const source of scripts || []) {
    try {
      const root = JSON.parse(source);
      const nodes = Array.isArray(root) ? root : root['@graph'] || [root];
      for (const item of nodes) {
        if (item && (item.uploadDate || item.datePublished || item.caption || item.description)) return item;
      }
    } catch { /* A malformed script is just unavailable evidence. */ }
  }
  return {};
}

export function itemFromSnapshot(item, snapshot) {
  const structured = jsonLdData(snapshot.json_ld);
  const description = snapshot.og_description || '';
  const text = snapshot.article_text || '';
  const aria = snapshot.aria_text || '';
  const fields = [description, aria, text];
  const findMetric = (names) => {
    for (let i = 0; i < fields.length; i++) {
      const parsed = metric(fields[i], names);
      if (parsed) return { ...parsed, source: ['og_description', 'aria_label', 'visible_text'][i] };
    }
    return null;
  };
  let likes = findMetric(['likes?']);
  if (!likes) {
    const others = /\band\s+(\d[\d,.]*\s*[KMB]?)\s+others?\b/i.exec(fields.join('\n'));
    const parsed = count(others?.[1]);
    if (parsed) likes = { ...parsed, value: parsed.value + 1, source: 'others_plus_one' };
  }
  const comments = findMetric(['comments?']);
  const views = findMetric(['views?', 'plays?']) || (snapshot.grid_views_count != null
    ? { ...count(String(snapshot.grid_views_count)), source: 'profile_grid' } : null);
  const dateRaw = snapshot.datetime || structured.uploadDate || structured.datePublished || null;
  const date = dateRaw && !Number.isNaN(Date.parse(dateRaw)) ? new Date(dateRaw).toISOString() : null;
  const caption = snapshot.caption || structured.caption || structured.description ||
    description.match(/:\s*[“"']?([\s\S]+)$/)?.[1]?.replace(/[”"']$/, '') || null;
  const hashtags = [...new Set((caption || '').match(/#[\p{L}\p{N}_]+/gu) || [])];
  const mentions = [...new Set((caption || '').match(/@[A-Za-z0-9._]+/g) || [])];
  const missing = [!date && 'date', !likes && 'likes', !comments && 'comments', !views && 'views'].filter(Boolean);
  return {
    ...item,
    fetched_at: now(),
    status: missing.length ? 'partial' : 'complete',
    date,
    caption,
    hashtags,
    mentions,
    likes,
    comments,
    views,
    thumbnail_url: snapshot.og_image || null,
    media_url: snapshot.og_video || null,
    missing,
    raw: { description, article_text: text.slice(0, 20000), aria_text: aria.slice(0, 10000), json_ld: structured }
  };
}
