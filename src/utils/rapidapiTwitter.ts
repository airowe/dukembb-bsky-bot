import axios from 'axios';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'twitter-api45.p.rapidapi.com';

export interface RapidApiTweet {
  id: string;
  text: string;
  url: string;
  timestamp: string;
  images: string[];
  altText: string[];
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
  // Adapt the response to match your Tweet interface
  return response.data.result.map((tweet: {
    id_str: string;
    full_text: string;
    created_at: string;
    entities?: {
      media?: { media_url_https: string }[];
      urls?: { url: string; expanded_url: string }[];
    };
  }) => {
    let text = tweet.full_text;
    if (tweet.entities?.urls && Array.isArray(tweet.entities.urls)) {
      for (const u of tweet.entities.urls) {
        if (u.url && u.expanded_url) {
          // Replace all instances of the t.co link with the expanded URL
          const regex = new RegExp(u.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          text = text.replace(regex, u.expanded_url);
        }
      }
    }
    return {
      id: tweet.id_str,
      text,
      url: `https://x.com/${username}/status/${tweet.id_str}`,
      timestamp: tweet.created_at,
      images: tweet.entities?.media?.map((m) => m.media_url_https) || [],
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
interface RapidApiRawTweet {
  tweet_id: string;
  text: string;
  screen_name?: string;
  created_at: string;
  media?: Media;
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
  return response.data.timeline
    .filter((tweet: any) => {
      // Exclude retweets (RT prefix or retweeted_status field)
      if (tweet.text && tweet.text.startsWith('RT ')) return false;
      if ('retweeted_status' in tweet) return false;
      // Exclude replies (text starts with '@' or in_reply_to_status_id present)
      if (tweet.text && tweet.text.trim().startsWith('@')) return false;
      if ('in_reply_to_status_id' in tweet && tweet.in_reply_to_status_id) return false;
      return true;
    })
    .map((tweet: any) => {
      // Expand t.co links if possible
      let text = tweet.text;
      if (tweet.entities && Array.isArray(tweet.entities.urls)) {
        for (const u of tweet.entities.urls) {
          if (u.url && u.expanded_url) {
            const regex = new RegExp(u.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            text = text.replace(regex, u.expanded_url);
          }
        }
      }
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
        images: [...images, ...videos],
        altText,
      };
    });
}



