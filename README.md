Duke MBB Twitter -> Bluesky mirror

This repo now runs entirely on a Cloudflare Worker. It polls Twitter via RapidAPI
and posts to Bluesky. The worker runs every 5 minutes but throttles to a
60-minute baseline outside game windows, and 5 minutes during game windows.

Worker URL
- https://dukembb-bsky-poller.adaminsley.workers.dev

Manual dry-run (no posting)
- https://dukembb-bsky-poller.adaminsley.workers.dev/dry-run
- https://dukembb-bsky-poller.adaminsley.workers.dev/dry-run-last

Deploy
- `npm run deploy:worker`

Config
- `worker/wrangler.toml`
- Secrets: `RAPIDAPI_KEY`, `BSKY_PASSWORD`
- Vars: `TWITTER_USERNAME`, `BSKY_USERNAME`
