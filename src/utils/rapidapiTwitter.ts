import axios from 'axios';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'twitter-api45.p.rapidapi.com';

export interface RapidApiTweet {
  id: string;
  text: string;
  url: string;
  timestamp: string;
  images: string[];
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
    entities?: { media?: { media_url_https: string }[] };
  }) => ({
    id: tweet.id_str,
    text: tweet.full_text,
    url: `https://x.com/${username}/status/${tweet.id_str}`,
    timestamp: tweet.created_at,
    images: tweet.entities?.media?.map((m) => m.media_url_https) || [],
  }));
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

export async function fetchLatestTweetsFromListRapidAPI(listId: string, count = 10): Promise<RapidApiTweet[]> {
  const url = `https://${RAPIDAPI_HOST}/listtimeline.php`;
  const response = await axios.get(url, {
    params: { list_id:listId, limit: count },
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY!,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    },
  });
  // Defensive check: ensure response.data.timeline is defined and is an array
  if (!response.data || !Array.isArray(response.data.timeline)) {
    console.error('[fetchLatestTweetsFromListRapidAPI] Unexpected API response:', JSON.stringify(response.data, null, 2));
    return [];
  }
  return response.data.timeline.map((tweet: RapidApiRawTweet) => {
    // Collect all image and video URLs from media if present
    const images = Array.isArray(tweet.media?.photo)
      ? tweet.media.photo.map((m: PhotoMedia) => m.media_url_https)
      : [];
    const videos = Array.isArray(tweet.media?.video)
      ? tweet.media.video.flatMap((v: VideoMedia) => {
          if (v.variants && Array.isArray(v.variants)) {
            // Prefer the highest bitrate mp4, else first variant
            const mp4s = v.variants.filter((va: VideoVariant) => va.content_type === 'video/mp4');
            if (mp4s.length) {
              return [mp4s.sort((a: VideoVariant, b: VideoVariant) => (b.bitrate || 0) - (a.bitrate || 0))[0].url];
            }
            return [v.variants[0]?.url].filter(Boolean);
          }
          return [];
        })
      : [];
    return {
      id: tweet.tweet_id,
      text: tweet.text,
      url: tweet.screen_name ? `https://x.com/${tweet.screen_name}/status/${tweet.tweet_id}` : '',
      timestamp: tweet.created_at,
      images: [...images, ...videos],
    };
  });
}


/**
 * Self-invoking polling function for serverless environments (e.g., Vercel, Netlify, etc.)
 * This will keep polling as long as the process is alive, without needing a cron job.
 */
export function startRapidApiPoller({
  username,
  onNewTweet,
  intervalMs = 60000,
}: {
  username: string;
  onNewTweet: (tweet: RapidApiTweet) => Promise<void>;
  intervalMs?: number;
}): void {
  let lastTweetId: string | null = null;
  async function poll() {
    try {
      const tweets = await fetchLatestTweetsRapidAPI(username, 3);
      if (!tweets.length) return;
      // Tweets are returned newest first
      const newTweets = lastTweetId
        ? tweets.filter((t: RapidApiTweet) => t.id !== lastTweetId)
        : [tweets[0]];
      if (newTweets.length) {
        for (const tweet of newTweets.reverse()) {
          await onNewTweet(tweet);
        }
        lastTweetId = tweets[0].id;
      }
    } catch (err) {
      console.error('RapidAPI polling error:', err);
    }
    setTimeout(poll, intervalMs);
  }
  poll(); // Run immediately
}
