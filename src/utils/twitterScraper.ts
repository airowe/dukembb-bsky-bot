import puppeteer from 'puppeteer';

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
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    );
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    // Wait for tweet articles to render
    await page.waitForSelector('article', { timeout: 20000 });
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

