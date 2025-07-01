import axios from 'axios';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'twitter241.p.rapidapi.com';

export interface RapidApiTweet {
  id: string;
  text: string;
  url: string;
  timestamp: string;
  images: string[];
}

export async function fetchLatestTweetsRapidAPI(username: string, count = 1): Promise<RapidApiTweet[]> {
  const url = `https://twitter241.p.rapidapi.com/user/tweets/${username}`;
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
