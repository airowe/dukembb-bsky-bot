import { startTweetPoller } from '@/utils/poller';
import { postToBluesky } from '@/utils/bluesky';
import { Tweet } from '@/utils/twitterScraper';

// Username to monitor (set in .env or hardcode for now)
const username = process.env.TWITTER_USER_ID || 'twitter'; // replace 'twitter' with your target

// Callback for new tweets
async function onNewTweet(tweet: Tweet) {
  // Post the tweet text and images to Bluesky
  await postToBluesky(tweet.text, tweet.images);
}

// Start polling when this script/module is run
startTweetPoller({
  username,
  onNewTweet,
  intervalMs: 60000, // poll every 60 seconds
});

console.log(`Started polling for new tweets from @${username}...`);
