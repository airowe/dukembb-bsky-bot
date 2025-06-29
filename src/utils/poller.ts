import { scrapeLatestTweets, Tweet } from './twitterScraper';

let lastTweetId: string | null = null;

/**
 * Polls Twitter for new tweets and triggers a callback for each new tweet found.
 * @param username Twitter username (without @)
 * @param onNewTweet Callback for each new tweet
 * @param intervalMs Polling interval in milliseconds
 */
export function startTweetPoller({
  username,
  onNewTweet,
  intervalMs = 60000,
}: {
  username: string;
  onNewTweet: (tweet: Tweet) => Promise<void>;
  intervalMs?: number;
}) {
  async function poll() {
    try {
      const tweets = await scrapeLatestTweets(username, 3);
      if (!tweets.length) return;
      // Tweets are returned newest first
      const newTweets = lastTweetId
        ? tweets.filter(t => t.id !== lastTweetId)
        : [tweets[0]];
      if (newTweets.length) {
        for (const tweet of newTweets.reverse()) {
          await onNewTweet(tweet);
        }
        lastTweetId = tweets[0].id;
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }
  poll(); // Run immediately
  setInterval(poll, intervalMs);
}
