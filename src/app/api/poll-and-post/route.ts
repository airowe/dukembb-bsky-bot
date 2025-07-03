import { NextRequest, NextResponse } from "next/server";
import { fetchLatestTweetsFromListRapidAPI } from "@/utils/rapidapiTwitter";
import { postToBluesky } from "@/utils/bluesky";

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
  console.log("[poll-and-post] POST handler called", {
    method: req?.method,
    url: req?.url,
    headers: req?.headers,
  });
  const listId = process.env.LIST_ID;
  if (!listId) {
    console.error("[poll-and-post] LIST_ID environment variable is not set.");
    return NextResponse.json(
      { ok: false, error: "LIST_ID environment variable is required." },
      { status: 500 }
    );
  }
  try {
    console.log(
      `[poll-and-post] Fetching tweets from Twitter List ID: ${listId}`
    );
    // Fetch tweets from Twitter List Timeline via RapidAPI
    // Requires RAPIDAPI_KEY and LIST_ID in env
    const tweets = await fetchLatestTweetsFromListRapidAPI(listId, 10);
    console.log("[poll-and-post] Fetched tweets from list (RapidAPI):", tweets);
    if (!tweets.length) {
      console.warn(
        `[poll-and-post] No tweets found for list ID ${listId} (RapidAPI)`
      );
      return NextResponse.json({ ok: true, message: "No tweets found." });
    }
    const lastTweetId = await getLastTweetId();
    // Only post tweets that are newer than lastTweetId
    let newTweets = tweets;
    if (lastTweetId) {
      const idx = tweets.findIndex((t: { id: string }) => t.id === lastTweetId);
      newTweets = idx === -1 ? tweets : tweets.slice(0, idx);
    }
    if (!newTweets.length) {
      console.log(
        `[poll-and-post] No new tweet to post. Last posted tweet: ${lastTweetId}`
      );
      return NextResponse.json({ ok: true, message: "No new tweet to post." });
    }
    // Post in chronological order (oldest first)
    for (const tweet of newTweets.reverse()) {
      await postToBluesky(tweet.text, tweet.images);
      console.log(`[poll-and-post] Posted tweet ${tweet.id} to Bluesky.`);
    }
    await setLastTweetId(newTweets[0].id); // The most recent tweet
    return NextResponse.json({
      ok: true,
      message: `Posted ${newTweets.length} new tweet(s) to Bluesky.`,
      tweets: newTweets,
    });
  } catch (err) {
    console.error(`[poll-and-post] Error:`, err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
