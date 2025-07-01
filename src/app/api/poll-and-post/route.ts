import { NextRequest, NextResponse } from 'next/server';
import { scrapeLatestTweets } from '@/utils/twitterScraper';
import { postToBluesky } from '@/utils/bluesky';

import { promises as fs } from 'fs';
import path from 'path';

const LAST_ID_PATH = path.join(process.cwd(), 'src/app/api/poll-and-post/lastTweetId.json');

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
  await fs.writeFile(LAST_ID_PATH, JSON.stringify({ lastTweetId: id }, null, 2), 'utf8');
}


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
    const lastTweetId = await getLastTweetId();
    if (tweet.id === lastTweetId) {
      console.log(`[poll-and-post] No new tweet to post. Last posted tweet: ${lastTweetId}`);
      return NextResponse.json({ ok: true, message: 'No new tweet to post.' });
    }
    await postToBluesky(tweet.text, tweet.images);
    await setLastTweetId(tweet.id);
    console.log(`[poll-and-post] Posted new tweet ${tweet.id} to Bluesky.`);
    return NextResponse.json({ ok: true, message: 'Posted new tweet to Bluesky.', tweet });
  } catch (err) {
    console.error(`[poll-and-post] Error:`, err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

