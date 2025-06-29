import { NextRequest, NextResponse } from 'next/server';
import { scrapeLatestTweets } from '@/utils/twitterScraper';
import { postToBluesky } from '@/utils/bluesky';

// In-memory cache for last tweet ID (reset on cold start)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let lastTweetId: string | null = null;

export async function POST(req: NextRequest) {
  let username = process.env.TWITTER_USER_ID || 'twitter';
  try {
    const body = await req.json().catch(() => ({}));
    if (body.username) {
      username = body.username;
    }
    console.log(`[poll-and-post] Scraping tweets for @${username}`);
    const tweets = await scrapeLatestTweets(username, 1);
    console.log('[poll-and-post] Scraped tweets:', tweets);
    if (!tweets.length) {
      console.warn(`[poll-and-post] No tweets found for @${username}`);
      return NextResponse.json({ ok: true, message: 'No tweets found.' });
    }
    const tweet = tweets[0];
    // DEBUG: Always post the latest tweet for troubleshooting
    await postToBluesky(tweet.text, tweet.images);
    lastTweetId = tweet.id;
    console.log(`[poll-and-post] (DEBUG) Forced post of tweet ${tweet.id} to Bluesky.`);
    return NextResponse.json({ ok: true, message: '(DEBUG) Forced post of latest tweet to Bluesky.', tweet });
  } catch (err) {
    lastTweetId = null;
    console.error(`[poll-and-post] Error:`, err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
