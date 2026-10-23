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
  const category = snapshot.category || bioLines.find((line) => /^(reel creator|digital creator|video creator|blogger|editor|artist|public figure|entrepreneur|personal blog)\s*•?$/i.test(line))?.replace(/\s*•$/, '') || null;
  const bioContent = bioLines.filter((line) => line !== category && line !== `${category} •` && !/^AI-generated profile$/i.test(line));
  const about = snapshot.about_text || '';
  const former = afterLabel(about, 'Former usernames');
  const description = snapshot.description || '';
  const headerFollowing = metric(header, ['following']);
  const metadataFollowing = metric(description, ['following']);
  const followingConflict = headerFollowing && metadataFollowing && headerFollowing.value !== metadataFollowing.value;
  const exactFollowers = count(snapshot.stat_evidence?.followers?.exact_title);
  const headerFollowers = metric(header, ['followers?']);
  const metadataFollowers = metric(description, ['followers?']);
  return {
    username,
    url: `https://www.instagram.com/${username}/`,
    fetched_at: now(),
    display_name: statIndex > 1 ? lines.slice(1, statIndex).join(' ') : null,
    bio: bioContent.length ? bioContent.join('\n') : null,
    posts_count: metric(header, ['posts?']) || metric(description, ['posts?']),
    followers_count: exactFollowers ? { ...exactFollowers, source: 'header_title' }
      : headerFollowers ? { ...headerFollowers, source: 'header_text' } : null,
    following_count: headerFollowing ? { ...headerFollowing, source: 'header_text' }
      : metadataFollowing ? { ...metadataFollowing, source: 'page_metadata' } : null,
    count_evidence: {
      followers: { header: headerFollowers, exact_title: exactFollowers, metadata: metadataFollowers },
      following: { header: headerFollowing, metadata: metadataFollowing, conflict: Boolean(followingConflict) },
      posts: { header: metric(header, ['posts?']), metadata: metric(description, ['posts?']) }
    },
    category,
    ai_generated_profile: lines.some((line) => /^AI-generated profile$/i.test(line)),
    profile_picture_url: snapshot.profile_picture_url || null,
    date_joined: afterLabel(about, 'Date joined'),
    account_based_in: afterLabel(about, 'Account based in'),
    former_usernames_count: count(former),
    raw: { header_text: header, about_text: about, description, stat_evidence: snapshot.stat_evidence || {} },
    issues: [
      ...(!header ? ['profile header unavailable'] : []),
      ...(!about ? ['About this account unavailable'] : []),
      ...(followingConflict ? [`Page metadata says ${metadataFollowing.raw} following; current profile header says ${headerFollowing.raw}, which is used for the count.`] : [])
    ]
  };
}

export function canonicalItemUrl(href) {
  try {
    const url = new URL(href, 'https://www.instagram.com');
    if (!['www.instagram.com', 'instagram.com'].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/(?:[A-Za-z0-9._]+\/)?(p|reel|reels)\/([A-Za-z0-9_-]+)\/?$/);
    if (!match) return null;
    const kind = match[1] === 'p' ? 'post' : 'reel';
    return { kind, shortcode: match[2], url: `https://www.instagram.com/${kind === 'post' ? 'p' : 'reel'}/${match[2]}/` };
  } catch { return null; }
}

export function dayFromDescription(description) {
  const match = String(description || '').match(/\bon\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})\s*:/);
  if (!match) return null;
  const parsed = new Date(`${match[1]} 00:00:00 GMT`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
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
  const views = findMetric(['views?', 'plays?']) || (snapshot.grid_views_raw
    ? { ...count(snapshot.grid_views_raw), source: 'profile_grid' } : null);
  const dateRaw = snapshot.datetime || structured.uploadDate || structured.datePublished || null;
  const calendarDay = dayFromDescription(description);
  const date = dateRaw && !Number.isNaN(Date.parse(dateRaw)) ? new Date(dateRaw).toISOString()
    : calendarDay;
  const date_precision = dateRaw && date ? 'timestamp' : date ? 'day' : null;
  const ogCaption = description.match(/:\s*[“"']([\s\S]*)[”"']\.?\s*$/)?.[1]
    || description.match(/:\s*([\s\S]+)$/)?.[1]?.trim();
  const caption = snapshot.caption || structured.caption || structured.description || ogCaption || null;
  const hashtags = [...new Set((caption || '').match(/#[\p{L}\p{N}_]+/gu) || [])];
  const mentions = [...new Set((caption || '').match(/@[A-Za-z0-9._]+/g) || [])];
  const missing = [!date && 'date', !likes && 'likes', !comments && 'comments', !views && 'views'].filter(Boolean);
  return {
    ...item,
    fetched_at: now(),
    status: missing.length ? 'partial' : 'complete',
    date,
    date_precision,
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
