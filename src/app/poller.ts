import { startRapidApiPoller } from '@/utils/rapidapiTwitter';
import { postToBluesky } from '@/utils/bluesky';

// Username to monitor (set in .env or hardcode for now)
const username = process.env.TWITTER_USER_ID || 'twitter'; // replace 'twitter' with your target

// Callback for new tweets
import type { RapidApiTweet } from '@/utils/rapidapiTwitter';

async function onNewTweet(tweet: RapidApiTweet) {
  // Post the tweet text and images to Bluesky
  await postToBluesky(tweet.text, tweet.images);
}

// Start polling when this script/module is run
startRapidApiPoller({
  username,
  onNewTweet,
  intervalMs: 60000, // poll every 60 seconds
});

console.log(`Started polling for new tweets from @${username}...`);
