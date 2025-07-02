import puppeteer from 'puppeteer-core';

// IMPORTANT: Set BROWSERLESS_WS_URL in your environment to your Browserless WebSocket endpoint
const BROWSERLESS_WS_URL = process.env.BROWSERLESS_WS_URL;
if (!BROWSERLESS_WS_URL) {
  throw new Error('BROWSERLESS_WS_URL environment variable is required for remote Puppeteer (Browserless)');
}

export interface Tweet {
  id: string;
  text: string;
  url: string;
  timestamp: string;
  images?: string[];
}

/**
 * Scrape the latest tweets from a public Twitter user's timeline (no auth required).
 * @param username Twitter handle (without @)
 * @param count Number of tweets to fetch
 */
export async function scrapeLatestTweets(username: string, count = 1): Promise<Tweet[]> {
  const url = `https://x.com/${username}`;
  const browser = await puppeteer.connect({
    browserWSEndpoint: BROWSERLESS_WS_URL,
  });
  try {
    const page = await browser.newPage();
    // Set a more realistic user-agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    // Set Accept-Language header to English
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });
    // Navigate to the page with a longer timeout
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    try {
      // Wait for tweet articles to render with a longer timeout
      await page.waitForSelector('article', { timeout: 25000 });
    } catch (err) {
      // Dump the HTML, page title, and body text for debugging if selector fails
      const html = await page.content();
      const title = await page.title();
      const bodyText = await page.evaluate(() => document.body.innerText || '');
      console.error('[twitterScraper] Failed to find <article> selector. Title:', title);
      console.error('[twitterScraper] Body text:', bodyText.slice(0, 2000));
      console.error('[twitterScraper] Dumping HTML:', html.slice(0, 2000));
      throw err;
    }
    // Extract tweets
    const tweets: Tweet[] = await page.evaluate((count) => {
      const articles = Array.from(document.querySelectorAll('article'));
      const tweets: Tweet[] = [];
      for (let i = 0; i < articles.length && tweets.length < count; i++) {
        const article = articles[i];
        // Exclude pinned tweets (look for 'Pinned Tweet' label, aria-label, or similar markers)
        const isPinned = (
          article.innerText && article.innerText.toLowerCase().includes('pinned tweet')
        ) ||
          (article.getAttribute('aria-label') && article.getAttribute('aria-label')!.toLowerCase().includes('pinned tweet'));
        if (isPinned) {
          // Optionally, log for debugging
          // console.log('Skipping pinned tweet:', article.innerText?.slice(0, 100));
          continue;
        }
        // Exclude replies (look for 'Replying to' label in the article)
        if (article.innerText && article.innerText.includes('Replying to')) {
          continue;
        }
        // Find tweet text
        const textElem = article.querySelector('div[lang]');
        const text = textElem?.textContent || '';
        // Find tweet URL and ID
        const linkElem = article.querySelector('a[href*="/status/"]');
        const link = linkElem ? linkElem.getAttribute('href') : '';
        const id = link?.split('/status/')[1]?.split('?')[0] || '';
        // Find timestamp
        const timeElem = article.querySelector('time');
        const timestamp = timeElem ? timeElem.getAttribute('datetime') || '' : '';
        // Find images (media)
        const imageElems = Array.from(article.querySelectorAll('img')) as HTMLImageElement[];
        // Filter out avatar and emoji images, keep only tweet media
        const images = imageElems
          .map(img => img.src)
          .filter(src =>
            src &&
            !src.includes('profile_images') &&
            !src.includes('emoji') &&
            !src.includes('abs.twimg.com') &&
            !src.endsWith('.svg')
          );
        if (id && text) {
          tweets.push({
            id,
            text: text.trim(),
            url: `https://x.com${link}`,
            timestamp,
            images,
          });
        }
      }
      return tweets;
    }, count);
    return tweets;
  } finally {
    await browser.close();
  }
}

