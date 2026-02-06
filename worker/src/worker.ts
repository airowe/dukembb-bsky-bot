/// <reference types="@cloudflare/workers-types" />

interface Env {
  DUKE_KV: KVNamespace;
  RAPIDAPI_KEY: string;
  TWITTER_USERNAME: string;
  BSKY_USERNAME: string;
  BSKY_PASSWORD: string;
  SCHEDULE_URL?: string;
  TIMEZONE?: string;
  BASELINE_MINUTES?: string;
  GAME_MINUTES?: string;
  GAME_WINDOW_BEFORE_MINUTES?: string;
  GAME_WINDOW_AFTER_MINUTES?: string;
  SCHEDULE_CACHE_TTL_MINUTES?: string;
}

interface PollState {
  lastPollAt?: number;
  lastMode?: 'baseline' | 'game';
}

interface ScheduleCache {
  fetchedAt: number;
  games: number[]; // UTC ms
}

interface RapidApiTweet {
  id: string;
  text: string;
  url: string;
  timestamp: string;
  images: string[];
  videos: string[];
  altText: string[];
}

interface AtProtoSession {
  accessJwt: string;
  did: string;
  createdAt: number;
}

const RAPIDAPI_HOST = 'twitter-api45.p.rapidapi.com';
const DEFAULT_SCHEDULE_URL = 'https://goduke.com/sports/mens-basketball/schedule/text';
const DEFAULT_TIMEZONE = 'America/New_York';
const DEFAULT_BASELINE_MINUTES = 60;
const DEFAULT_GAME_MINUTES = 5;
const DEFAULT_GAME_WINDOW_BEFORE_MINUTES = 90;
const DEFAULT_GAME_WINDOW_AFTER_MINUTES = 210;
const DEFAULT_SCHEDULE_CACHE_TTL_MINUTES = 360;
const MAX_POSTS_PER_RUN = 3;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 1_000_000;

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env));
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === '/run') {
      const result = await run(env);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('ok', { status: 200 });
  },
};

async function run(env: Env) {
  const now = Date.now();
  const baselineMinutes = getInt(env.BASELINE_MINUTES, DEFAULT_BASELINE_MINUTES);
  const gameMinutes = getInt(env.GAME_MINUTES, DEFAULT_GAME_MINUTES);
  const gameBeforeMinutes = getInt(env.GAME_WINDOW_BEFORE_MINUTES, DEFAULT_GAME_WINDOW_BEFORE_MINUTES);
  const gameAfterMinutes = getInt(env.GAME_WINDOW_AFTER_MINUTES, DEFAULT_GAME_WINDOW_AFTER_MINUTES);

  const games = await getSchedule(env, now);
  const inGameWindow = games.some((startUtcMs) => {
    const start = startUtcMs - gameBeforeMinutes * 60_000;
    const end = startUtcMs + gameAfterMinutes * 60_000;
    return now >= start && now <= end;
  });

  const mode: PollState['lastMode'] = inGameWindow ? 'game' : 'baseline';
  const intervalMinutes = inGameWindow ? gameMinutes : baselineMinutes;

  const state = await getPollState(env);
  const shouldPoll = mode !== state.lastMode || now - (state.lastPollAt ?? 0) >= intervalMinutes * 60_000;

  if (!shouldPoll) {
    return { ok: true, skipped: true, mode, reason: 'interval-not-reached' };
  }

  const ok = await pollAndPost(env);
  if (ok) {
    await setPollState(env, { lastPollAt: now, lastMode: mode });
  }

  return { ok, skipped: !ok, mode };
}

async function pollAndPost(env: Env): Promise<boolean> {
  if (!env.RAPIDAPI_KEY || !env.TWITTER_USERNAME || !env.BSKY_USERNAME || !env.BSKY_PASSWORD) {
    console.log('[worker] Missing required env vars');
    return false;
  }

  const tweets = await fetchLatestTweetsRapidAPI(env.TWITTER_USERNAME, env.RAPIDAPI_KEY, 10);
  if (!tweets.length) {
    return true;
  }

  const lastTweetId = await getLastTweetId(env);
  const tweetsChrono = [...tweets].reverse();
  let newTweets: RapidApiTweet[] = tweetsChrono;

  if (lastTweetId) {
    const idx = tweetsChrono.findIndex((t) => t.id === lastTweetId);
    if (idx === -1) {
      console.log('[worker] Last tweet not found in latest fetch; skipping to avoid duplicates');
      return true;
    }
    newTweets = tweetsChrono.slice(idx + 1);
  }

  if (!newTweets.length) {
    return true;
  }

  const toPost = newTweets.slice(0, MAX_POSTS_PER_RUN);
  for (const tweet of toPost) {
    const ok = await postToBluesky(env, tweet.text, tweet.images, tweet.videos, tweet.altText);
    if (!ok) return false;
  }

  await setLastTweetId(env, toPost[toPost.length - 1].id);
  return true;
}

async function fetchLatestTweetsRapidAPI(username: string, apiKey: string, count = 10): Promise<RapidApiTweet[]> {
  const url = `https://${RAPIDAPI_HOST}/user/tweets/${username}?limit=${count}`;
  const response = await fetch(url, {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    },
  });
  if (!response.ok) {
    console.log('[worker] RapidAPI error', response.status);
    return [];
  }
  const data = await response.json();
  const raw = Array.isArray(data?.result) ? data.result : [];

  return raw
    .filter((tweet: {
      full_text?: string;
      text?: string;
      retweeted_status?: unknown;
      in_reply_to_status_id?: string | null;
      in_reply_to_status_id_str?: string | null;
      is_reply?: boolean;
    }) => {
      const t = tweet.full_text ?? tweet.text ?? '';
      if (t.startsWith('RT ')) return false;
      if (tweet.retweeted_status) return false;
      if (tweet.in_reply_to_status_id || tweet.in_reply_to_status_id_str) return false;
      if (tweet.is_reply) return false;
      return true;
    })
    .map((tweet: {
      id_str: string;
      full_text?: string;
      text?: string;
      created_at: string;
      entities?: {
        media?: { media_url_https: string; type?: string; video_info?: { variants?: { content_type: string; url: string; bitrate?: number }[] }; ext_alt_text?: string | null }[];
        urls?: { url: string; expanded_url: string }[];
      };
      extended_entities?: {
        media?: { media_url_https: string; type?: string; video_info?: { variants?: { content_type: string; url: string; bitrate?: number }[] }; ext_alt_text?: string | null }[];
      };
    }) => {
      let text = htmlDecode(tweet.full_text ?? tweet.text ?? '');
      text = expandUrls(text, tweet.entities?.urls);

      const media = tweet.extended_entities?.media || tweet.entities?.media || [];
      const images: string[] = [];
      const videos: string[] = [];
      const altText: string[] = [];

      for (const m of media) {
        if (m.type === 'photo' && m.media_url_https) {
          images.push(m.media_url_https);
          altText.push(m.ext_alt_text ?? `Image from tweet by @${username}`);
          continue;
        }
        if ((m.type === 'video' || m.type === 'animated_gif') && m.video_info?.variants) {
          const mp4s = m.video_info.variants.filter((v) => v.content_type === 'video/mp4');
          const best = mp4s.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0]?.url;
          if (best) videos.push(best);
        }
      }

      return {
        id: tweet.id_str,
        text,
        url: `https://x.com/${username}/status/${tweet.id_str}`,
        timestamp: tweet.created_at,
        images,
        videos,
        altText,
      };
    });
}

async function postToBluesky(env: Env, text: string, images: string[], videos: string[], altText: string[]): Promise<boolean> {
  const safeText = escapeBlueskyText(text);
  const facets = buildFacets(safeText);

  const session = await getSession(env);
  if (!session) return false;

  let embed: unknown = undefined;

  if (videos.length > 0) {
    embed = {
      $type: 'app.bsky.embed.external',
      external: {
        uri: videos[0],
        title: 'Video',
        description: '',
      },
    };
  } else if (images.length > 0) {
    const uploaded = await uploadImages(env, session.accessJwt, images, altText);
    if (uploaded.length > 0) {
      embed = {
        $type: 'app.bsky.embed.images',
        images: uploaded,
      };
    }
  }

  const record: Record<string, unknown> = {
    $type: 'app.bsky.feed.post',
    text: safeText,
    createdAt: new Date().toISOString(),
  };
  if (facets.length > 0) record.facets = facets;
  if (embed) record.embed = embed;

  const ok = await createRecord(env, session, record);
  if (ok) return true;

  // Retry once with a new session (token might be expired)
  await clearSession(env);
  const fresh = await getSession(env);
  if (!fresh) return false;
  return createRecord(env, fresh, record);
}

async function createRecord(env: Env, session: AtProtoSession, record: Record<string, unknown>): Promise<boolean> {
  const res = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session.accessJwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record,
    }),
  });
  if (!res.ok) {
    console.log('[worker] createRecord failed', res.status);
    return false;
  }
  return true;
}

async function uploadImages(env: Env, accessJwt: string, images: string[], altText: string[]) {
  const out: { image: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number }; alt: string }[] = [];

  for (const [i, url] of images.slice(0, MAX_IMAGES).entries()) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) continue;
      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) continue;

      const upload = await fetch('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessJwt}`,
          'content-type': contentType,
        },
        body: arrayBuffer,
      });
      if (!upload.ok) continue;
      const data = await upload.json();
      if (!data?.blob) continue;

      out.push({
        image: data.blob,
        alt: altText[i] || '',
      });
    } catch (err) {
      console.log('[worker] image upload error', (err as Error).message);
    }
  }

  return out;
}

async function getSession(env: Env): Promise<AtProtoSession | null> {
  const cached = await env.DUKE_KV.get('bsky-session', 'json');
  if (cached && typeof cached === 'object' && (cached as AtProtoSession).accessJwt) {
    return cached as AtProtoSession;
  }

  const res = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identifier: env.BSKY_USERNAME,
      password: env.BSKY_PASSWORD,
    }),
  });
  if (!res.ok) {
    console.log('[worker] createSession failed', res.status);
    return null;
  }
  const data = await res.json();
  if (!data?.accessJwt || !data?.did) return null;
  const session: AtProtoSession = {
    accessJwt: data.accessJwt,
    did: data.did,
    createdAt: Date.now(),
  };
  await env.DUKE_KV.put('bsky-session', JSON.stringify(session), { expirationTtl: 60 * 60 });
  return session;
}

async function clearSession(env: Env) {
  await env.DUKE_KV.delete('bsky-session');
}

async function getLastTweetId(env: Env): Promise<string | null> {
  const val = await env.DUKE_KV.get('lastTweetId');
  return val || null;
}

async function setLastTweetId(env: Env, id: string) {
  await env.DUKE_KV.put('lastTweetId', id);
}

async function getPollState(env: Env): Promise<PollState> {
  const raw = await env.DUKE_KV.get('poll-state', 'json');
  if (!raw || typeof raw !== 'object') return {};
  return raw as PollState;
}

async function setPollState(env: Env, state: PollState) {
  await env.DUKE_KV.put('poll-state', JSON.stringify(state));
}

async function getSchedule(env: Env, nowMs: number): Promise<number[]> {
  const cacheTtlMinutes = getInt(env.SCHEDULE_CACHE_TTL_MINUTES, DEFAULT_SCHEDULE_CACHE_TTL_MINUTES);
  const cached = await env.DUKE_KV.get('schedule-cache', 'json');
  if (cached && typeof cached === 'object') {
    const cache = cached as ScheduleCache;
    if (cache.fetchedAt && nowMs - cache.fetchedAt < cacheTtlMinutes * 60_000 && Array.isArray(cache.games)) {
      return cache.games;
    }
  }

  const scheduleUrl = env.SCHEDULE_URL || DEFAULT_SCHEDULE_URL;
  try {
    const res = await fetch(scheduleUrl, { headers: { 'user-agent': 'dukembb-bsky-bot/1.0' } });
    if (!res.ok) {
      console.log('[worker] schedule fetch failed', res.status);
      return [];
    }
    const text = await res.text();
    const games = parseSchedule(text, env.TIMEZONE || DEFAULT_TIMEZONE, nowMs);
    const cache: ScheduleCache = { fetchedAt: nowMs, games };
    await env.DUKE_KV.put('schedule-cache', JSON.stringify(cache));
    return games;
  } catch (err) {
    console.log('[worker] schedule fetch error', (err as Error).message);
    return [];
  }
}

function parseSchedule(text: string, timeZone: string, nowMs: number): number[] {
  const seasonStartYear = inferSeasonStartYear(text, nowMs);
  const lines = text.split('\n');
  const games: number[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const monthMatch = line.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+\([A-Za-z]{3}\)/);
    if (!monthMatch) continue;

    const monthName = monthMatch[1];
    const day = parseInt(monthMatch[2], 10);
    const rest = line.slice(monthMatch[0].length).trim();

    const haMatch = rest.match(/(Home|Away|Neutral)/);
    if (!haMatch || haMatch.index === undefined) continue;

    const timeRaw = rest.slice(0, haMatch.index).trim();
    const time = parseTime(timeRaw);
    if (!time) continue;

    const monthIndex = monthIndexFromName(monthName);
    const year = monthIndex >= 6 ? seasonStartYear : seasonStartYear + 1;

    const startUtcMs = zonedTimeToUtcMs(
      { year, month: monthIndex + 1, day, hour: time.hour, minute: time.minute },
      timeZone
    );

    if (!Number.isNaN(startUtcMs)) {
      games.push(startUtcMs);
    }
  }

  return games;
}

function inferSeasonStartYear(text: string, nowMs: number): number {
  const match = text.match(/(20\d{2})-(\d{2})\s+Men's Basketball Schedule/);
  if (match) {
    return parseInt(match[1], 10);
  }
  const now = new Date(nowMs);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return month >= 6 ? year : year - 1;
}

function parseTime(raw: string): { hour: number; minute: number } | null {
  if (!raw || /TBA/i.test(raw)) return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const isPm = match[3].toLowerCase().startsWith('p');
  if (isPm && hour !== 12) hour += 12;
  if (!isPm && hour === 12) hour = 0;
  return { hour, minute };
}

function monthIndexFromName(name: string): number {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.indexOf(name);
}

function zonedTimeToUtcMs(
  dateParts: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string
): number {
  const utcGuess = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    dateParts.hour,
    dateParts.minute,
    0
  );
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return utcGuess - offset;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const asUTC = Date.UTC(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    Number(get('hour')),
    Number(get('minute')),
    Number(get('second'))
  );
  return asUTC - date.getTime();
}

function getInt(value: string | undefined, fallback: number): number {
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isNaN(parsed) ? fallback : parsed;
}

function expandUrls(text: string, urls?: { url: string; expanded_url: string }[]): string {
  if (!urls || !Array.isArray(urls)) return text;
  let updated = text;
  for (const u of urls) {
    if (u.url && u.expanded_url) {
      const regex = new RegExp(u.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      updated = updated.replace(regex, u.expanded_url);
    }
  }
  return updated;
}

function htmlDecode(text: string): string {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
}

function escapeBlueskyText(text: string): string {
  let safe = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
  safe = safe.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
  safe = safe.replace(/[ \t\xA0]{2,}/g, ' ');
  safe = safe.trim();
  safe = safe.replace(/\r\n?/g, '\n');
  return safe;
}

function buildFacets(text: string) {
  const facets: { index: { byteStart: number; byteEnd: number }; features: { $type: string; uri: string }[] }[] = [];
  const urlRegex = /https?:\/\/[^\s]+/g;
  const encoder = new TextEncoder();

  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0];
    const startChar = match.index;
    const endChar = startChar + url.length;
    const byteStart = encoder.encode(text.slice(0, startChar)).length;
    const byteEnd = byteStart + encoder.encode(text.slice(startChar, endChar)).length;

    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
    });
  }

  return facets;
}

export {
  parseSchedule,
  inferSeasonStartYear,
  parseTime,
  monthIndexFromName,
  zonedTimeToUtcMs,
  getInt,
  buildFacets,
  htmlDecode,
  escapeBlueskyText,
};
