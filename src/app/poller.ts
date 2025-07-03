import { startRapidApiPoller } from '@/utils/rapidapiTwitter';
import { postToBluesky } from '@/utils/bluesky';

// Username to monitor (set in .env or hardcode for now)
const username = process.env.TWITTER_USER_ID || 'twitter'; // replace 'twitter' with your target

// Callback for new tweets
import type { RapidApiTweet } from '@/utils/rapidapiTwitter';

async function onNewTweet(tweet: RapidApiTweet) {
  // Separate images and videos
  const images = (tweet.images || []).filter(url => !url.endsWith('.mp4'));
  const videos = (tweet.images || []).filter(url => url.endsWith('.mp4'));
  await postToBluesky(tweet.text, images, videos);
}

// Start polling when this script/module is run
startRapidApiPoller({
  username,
  onNewTweet,
  intervalMs: 60000, // poll every 60 seconds
});

console.log(`Started polling for new tweets from @${username}...`);
