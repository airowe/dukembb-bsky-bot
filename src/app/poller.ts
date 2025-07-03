import { fetchLatestTweetsFromListRapidAPI } from '@/utils/rapidapiTwitter';
import { postToBluesky } from '@/utils/bluesky';
import type { RapidApiTweet } from '@/utils/rapidapiTwitter';

// Twitter List ID to monitor (set in .env)
const listId = process.env.LIST_ID;
if (!listId) {
  throw new Error('LIST_ID environment variable is required');
}

// Callback for new tweets
async function onNewTweet(tweet: RapidApiTweet) {
  // Separate images and videos
  const images = (tweet.images || []).filter(url => !url.endsWith('.mp4'));
  const videos = (tweet.images || []).filter(url => url.endsWith('.mp4'));
  await postToBluesky(tweet.text, images, videos);
}

let lastTweetId: string | null = null;

async function pollList() {
  try {
    if (!listId) {
      console.error('LIST_ID environment variable is not set.');
      return;
    }
    const tweets = await fetchLatestTweetsFromListRapidAPI(listId, 1); // Fetch only 1 tweet per poll
    if (!tweets.length) return;
    // Only post if new
    if (tweets[0].id !== lastTweetId) {
      await onNewTweet(tweets[0]);
      lastTweetId = tweets[0].id;
      console.log(`Posted new tweet ${tweets[0].id} from list ${listId}`);
    }
  } catch (err) {
    console.error('Polling error:', err);
  }
}

function pollListIfAllowed() {
  const now = new Date();
  const hour = now.getHours();
  // Only poll between 9AM (9) and 11PM (23), skip otherwise
  if (hour >= 9 && hour < 23) {
    pollList();
  }
}

// Poll every 24 minutes (14 hours/day × 60 min/hour ÷ 25 min ≈ 33.6 polls/day × 30 ≈ 1008 objects/month)
const intervalMs = 24 * 60 * 1000;
setInterval(pollListIfAllowed, intervalMs);
pollListIfAllowed(); // Run immediately

console.log(`Started polling Twitter List ${listId} every 24 minutes (1 tweet per poll, only between 9AM and 11PM, approaches 1008 objects/month)...`);
