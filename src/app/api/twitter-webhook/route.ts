import { NextRequest, NextResponse } from 'next/server';

// Not needed: Twitter CRC validation (no longer using Twitter API)
// This endpoint will poll and return latest tweets for a user.

import { scrapeLatestTweets } from '@/utils/twitterScraper';

// POST: { username: string, count?: number }
export async function POST(req: NextRequest) {
  const { username, count = 1 } = await req.json();
  if (!username) {
    return NextResponse.json({ error: 'Missing username' }, { status: 400 });
  }
  try {
    const tweets = await scrapeLatestTweets(username, count);
    return NextResponse.json({ tweets });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
