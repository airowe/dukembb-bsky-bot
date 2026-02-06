import { NextRequest, NextResponse } from "next/server";
import { fetchLatestTweetsFromListRapidAPI, fetchLatestTweetsRapidAPI } from "@/utils/rapidapiTwitter";
import { postToBluesky } from "@/utils/bluesky"; // (postToBluesky now escapes text)

import { promises as fs } from "fs";
import path from "path";

console.log("[poll-and-post] API route loaded. ENV:", {
  VERCEL: process.env.VERCEL,
  NODE_ENV: process.env.NODE_ENV,
  CWD: process.cwd(),
  FILE: __filename,
});

export async function GET(req: NextRequest) {
  console.log("[poll-and-post] GET handler called", {
    method: req?.method,
    url: req?.url,
    headers: req?.headers,
  });
  return NextResponse.json({ ok: true, message: "GET works!" });
}

const LAST_ID_PATH = process.env.VERCEL
  ? "/tmp/lastTweetId.json"
  : path.join(process.cwd(), "src/app/api/poll-and-post/lastTweetId.json");

async function getLastTweetId(): Promise<string | null> {
  try {
    const data = await fs.readFile(LAST_ID_PATH, "utf8");
    const parsed = JSON.parse(data);
    return parsed.lastTweetId || null;
  } catch {
    return null;
  }
}

async function setLastTweetId(id: string): Promise<void> {
  await fs.writeFile(
    LAST_ID_PATH,
    JSON.stringify({ lastTweetId: id }, null, 2),
    { encoding: "utf8", flag: "w" }
  );
}

export async function POST(req: NextRequest) {
  // --- Simple Auth: Require Bearer token in Authorization header ---
  const authHeader = req.headers.get('authorization');
  const expectedToken = process.env.POLL_AND_POST_SECRET;
  if (!expectedToken || !authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized: Missing or invalid auth header.' },
      { status: 401 }
    );
  }
  const token = authHeader.substring('Bearer '.length).trim();
  if (token !== expectedToken) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized: Invalid token.' },
      { status: 401 }
    );
  }
  // --- End Auth ---

  console.log("[poll-and-post] POST handler called", {
    method: req?.method,
    url: req?.url,
    headers: req?.headers,
  });
  const twitterUsername = process.env.TWITTER_USERNAME || process.env.TWITTER_USER_ID;
  const listId = process.env.LIST_ID;
  if (!twitterUsername && !listId) {
    console.error("[poll-and-post] TWITTER_USERNAME/TWITTER_USER_ID or LIST_ID environment variable is not set.");
    return NextResponse.json(
      { ok: false, error: "TWITTER_USERNAME (or TWITTER_USER_ID) or LIST_ID is required." },
      { status: 500 }
    );
  }
  try {
    let tweets;
    if (twitterUsername) {
      console.log(
        `[poll-and-post] Fetching tweets from Twitter user: ${twitterUsername}`
      );
      // Fetch tweets from Twitter user timeline via RapidAPI
      // Requires RAPIDAPI_KEY and TWITTER_USERNAME/TWITTER_USER_ID in env
      tweets = await fetchLatestTweetsRapidAPI(twitterUsername, 10);
    } else {
      console.log(
        `[poll-and-post] Fetching tweets from Twitter List ID: ${listId}`
      );
      // Fetch tweets from Twitter List Timeline via RapidAPI
      // Requires RAPIDAPI_KEY and LIST_ID in env
      tweets = await fetchLatestTweetsFromListRapidAPI(listId, 10);
    }
    console.log("[poll-and-post] Fetched tweets (RapidAPI):", tweets);
    if (!tweets.length) {
      console.warn(
        `[poll-and-post] No tweets found (RapidAPI)`
      );
      return NextResponse.json({ ok: true, message: "No tweets found." });
    }
    const lastTweetId = await getLastTweetId();
    // Ensure tweets are in chronological order (oldest first)
    const tweetsChrono = [...tweets].reverse();
    let newTweets: typeof tweetsChrono = tweetsChrono;
    if (lastTweetId) {
      const idx = tweetsChrono.findIndex((t: { id: string }) => t.id === lastTweetId);
      if (idx === -1) {
        // If lastTweetId is not present, skip posting to avoid duplicates
        console.warn(`[poll-and-post] Last posted tweet ID (${lastTweetId}) not found in latest fetched tweets. Skipping posting to avoid duplicates.`);
        return NextResponse.json({ ok: true, message: "Last posted tweet not found in latest fetch. Skipping to avoid duplicates." });
      }
      newTweets = tweetsChrono.slice(idx + 1); // Only tweets after the last posted one
    }
    if (!newTweets.length) {
      console.log(
        `[poll-and-post] No new tweet to post. Last posted tweet: ${lastTweetId}`
      );
      return NextResponse.json({ ok: true, message: "No new tweet to post." });
    }
    // Post at most 3 tweets per poll, oldest first
    const toPost = newTweets.slice(0, 3);
    for (const tweet of toPost) {
      // Pass altText for images to Bluesky
      await postToBluesky(tweet.text, tweet.images, tweet.videos, tweet.altText);
      console.log(`[poll-and-post] Posted tweet ${tweet.id} to Bluesky.`);
    }
    await setLastTweetId(toPost[toPost.length - 1].id); // The most recent tweet posted
    return NextResponse.json({
      ok: true,
      message: `Posted ${toPost.length} new tweet(s) to Bluesky.`,
      tweets: toPost,
    });
  } catch (err) {
    console.error(`[poll-and-post] Error:`, err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
