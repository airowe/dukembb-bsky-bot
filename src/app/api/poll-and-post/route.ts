import { NextRequest, NextResponse } from 'next/server';
import { scrapeLatestTweets } from '@/utils/twitterScraper';
import { postToBluesky } from '@/utils/bluesky';

import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
  return NextResponse.json({ ok: true, message: 'GET works!' });
}

const LAST_ID_PATH = process.env.VERCEL
  ? '/tmp/lastTweetId.json'
  : path.join(process.cwd(), 'src/app/api/poll-and-post/lastTweetId.json');

async function getLastTweetId(): Promise<string | null> {
  try {
    const data = await fs.readFile(LAST_ID_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.lastTweetId || null;
  } catch {
    return null;
  }
}

async function setLastTweetId(id: string): Promise<void> {
  await fs.writeFile(LAST_ID_PATH, JSON.stringify({ lastTweetId: id }, null, 2), { encoding: 'utf8', flag: 'w' });
}


export async function POST(req: NextRequest) {
  let username = process.env.TWITTER_USER_ID || 'twitter';
  try {
    const body = await req.json().catch(() => ({}));
    if (body.username) {
      username = body.username;
    }
    console.log(`[poll-and-post] Scraping tweets for @${username}`);
    // Fetch more tweets to ensure we don't miss any due to pins/replies
    const tweets = await scrapeLatestTweets(username, 10);
    console.log('[poll-and-post] Scraped tweets:', tweets);
    if (!tweets.length) {
      console.warn(`[poll-and-post] No tweets found for @${username}`);
      return NextResponse.json({ ok: true, message: 'No tweets found.' });
    }
    const lastTweetId = await getLastTweetId();
    // Only post tweets that are newer than lastTweetId
    let newTweets = tweets;
    if (lastTweetId) {
      const idx = tweets.findIndex(t => t.id === lastTweetId);
      newTweets = idx === -1 ? tweets : tweets.slice(0, idx);
    }
    if (!newTweets.length) {
      console.log(`[poll-and-post] No new tweet to post. Last posted tweet: ${lastTweetId}`);
      return NextResponse.json({ ok: true, message: 'No new tweet to post.' });
    }
    // Post in chronological order (oldest first)
    for (const tweet of newTweets.reverse()) {
      await postToBluesky(tweet.text, tweet.images);
      console.log(`[poll-and-post] Posted tweet ${tweet.id} to Bluesky.`);
    }
    await setLastTweetId(newTweets[0].id); // The most recent tweet
    return NextResponse.json({ ok: true, message: `Posted ${newTweets.length} new tweet(s) to Bluesky.`, tweets: newTweets });
  } catch (err) {
    console.error(`[poll-and-post] Error:`, err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

