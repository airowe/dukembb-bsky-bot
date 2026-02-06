Cloudflare Worker poller (all-in-one)

This worker runs every 5 minutes and directly polls Twitter via RapidAPI, then
posts to Bluesky. It switches to a faster polling interval around Duke MBB
game windows based on the GoDuke schedule text feed.

Defaults
- Baseline polling: every 45 minutes
- Game window polling: every 5 minutes
- Game window: 90 minutes before tipoff through 210 minutes after tipoff
- Schedule source: https://goduke.com/sports/mens-basketball/schedule/text
- Time zone: America/New_York

Setup
1. Create a KV namespace and update `worker/wrangler.toml` with its `id`.
2. Set secrets:
   - `wrangler secret put RAPIDAPI_KEY --config worker/wrangler.toml`
   - `wrangler secret put BSKY_PASSWORD --config worker/wrangler.toml`
3. Set vars in `worker/wrangler.toml`:
   - `TWITTER_USERNAME`
   - `BSKY_USERNAME`
4. Deploy:
   - `wrangler deploy --config worker/wrangler.toml`

Optional tuning (vars in `worker/wrangler.toml`)
- `BASELINE_MINUTES` (default 45)
- `GAME_MINUTES` (default 5)
- `GAME_WINDOW_BEFORE_MINUTES` (default 90)
- `GAME_WINDOW_AFTER_MINUTES` (default 210)
- `TIMEZONE` (default America/New_York)
- `SCHEDULE_URL` (default GoDuke schedule text)
- `SCHEDULE_CACHE_TTL_MINUTES` (default 360)

Manual trigger
- `curl https://<worker-domain>/run` for a one-off run
