import axios from 'axios';
import { htmlDecode } from './htmlDecode';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'twitter-api45.p.rapidapi.com';

export interface RapidApiTweet {
  id: string;
  text: string;
  url: string;
  timestamp: string;
  images: string[];
  videos?: string[];
  altText: string[];
}

interface UrlEntity {
  url: string;
  expanded_url: string;
}

function expandUrls(text: string, urls?: UrlEntity[]): string {
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

export async function fetchLatestTweetsRapidAPI(username: string, count = 1): Promise<RapidApiTweet[]> {
  const url = `https://${RAPIDAPI_HOST}/user/tweets/${username}`;
  const response = await axios.get(url, {
    params: { limit: count },
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY!,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    },
  });
  const raw = Array.isArray(response.data?.result) ? response.data.result : [];
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
        media?: { media_url_https: string; type?: string; video_info?: { variants?: VideoVariant[] }; ext_alt_text?: string | null }[];
        urls?: UrlEntity[];
      };
      extended_entities?: {
        media?: { media_url_https: string; type?: string; video_info?: { variants?: VideoVariant[] }; ext_alt_text?: string | null }[];
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

/**
 * Fetch latest tweets from a Twitter List via RapidAPI List Timeline endpoint
 * @param listId Twitter List ID
 * @param count Number of tweets to fetch
 */
interface PhotoMedia {
  media_url_https: string;
}
interface VideoVariant {
  content_type: string;
  url: string;
  bitrate?: number;
}
interface VideoMedia {
  variants?: VideoVariant[];
}
interface Media {
  photo?: PhotoMedia[];
  video?: VideoMedia[];
}


export async function fetchLatestTweetsFromListRapidAPI(listId: string, count = 3): Promise<RapidApiTweet[]> {
  const url = `https://${RAPIDAPI_HOST}/listtimeline.php`;
  const response = await axios.get(url, {
    params: { list_id:listId, limit: count },
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY!,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    },
  });
  console.log('[fetchLatestTweetsFromListRapidAPI] API response:', JSON.stringify(response.data, null, 2));
  // Defensive check: ensure response.data.timeline is defined and is an array
  if (!response.data || !Array.isArray(response.data.timeline)) {
    console.error('[fetchLatestTweetsFromListRapidAPI] Unexpected API response:', JSON.stringify(response.data, null, 2));
    return [];
  }
  interface ListApiTweet {
    tweet_id: string;
    text: string;
    screen_name?: string;
    created_at: string;
    media?: Media;
    entities?: {
      urls?: { url: string; expanded_url: string }[];
    };
    retweeted_status?: unknown;
    in_reply_to_status_id?: string | null;
  }

  return (response.data.timeline as ListApiTweet[])
    .filter((tweet) => {
      // Exclude retweets (RT prefix or retweeted_status field)
      if (tweet.text && tweet.text.startsWith('RT ')) return false;
      if ('retweeted_status' in tweet) return false;
      // Exclude replies (text starts with '@' or in_reply_to_status_id present)
      if ('in_reply_to_status_id' in tweet && tweet.in_reply_to_status_id) return false;
      return true;
    })
    .map((tweet) => {
      // Decode HTML entities first
      let text = htmlDecode(tweet.text);
      // Build t.co -> expanded_url map
      const urlMap: Record<string, string> = {};
      if (tweet.entities && Array.isArray(tweet.entities.urls)) {
        for (const u of tweet.entities.urls) {
          if (u.url && u.expanded_url) {
            urlMap[u.url] = u.expanded_url;
          }
        }
      }
      // Replace all t.co links in text with expanded_url if available
      text = text.replace(/https?:\/\/t\.co\/[a-zA-Z0-9]+/g, (match) => urlMap[match] || match);
      const images = Array.isArray(tweet.media?.photo)
        ? tweet.media.photo.map((m: PhotoMedia) => m.media_url_https)
        : [];
      const videos = Array.isArray(tweet.media?.video)
        ? tweet.media.video.flatMap((v: VideoMedia) => {
            if (v.variants && Array.isArray(v.variants)) {
              const mp4s = v.variants.filter((va: VideoVariant) => va.content_type === 'video/mp4');
              if (mp4s.length) {
                return [mp4s.sort((a: VideoVariant, b: VideoVariant) => (b.bitrate || 0) - (a.bitrate || 0))[0].url];
              }
              return [v.variants[0]?.url].filter(Boolean);
            }
            return [];
          })
        : [];
      const altText = images.map(() => tweet.screen_name ? `Image from tweet by @${tweet.screen_name}` : '');
      return {
        id: tweet.tweet_id,
        text,
        url: tweet.screen_name ? `https://x.com/${tweet.screen_name}/status/${tweet.tweet_id}` : '',
        timestamp: tweet.created_at,
        images,
        videos,
        altText,
      };
    });
}
