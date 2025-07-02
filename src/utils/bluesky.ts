import { AtpAgent, AppBskyEmbedImages, $Typed } from '@atproto/api';

let agent: AtpAgent | null = null;

async function getAgent() {
  if (!agent) {
    agent = new AtpAgent({ service: 'https://bsky.social' });
    await agent.login({
      identifier: process.env.NEXT_PUBLIC_BSKY_USERNAME!,
      password: process.env.NEXT_BSKY_PASSWORD!,
    });
  }
  return agent;
}

import axios from 'axios';

export async function postToBluesky(text: string, images?: string[]) {
  const agent = await getAgent();
  let embed: $Typed<AppBskyEmbedImages.Main> | undefined;
  if (images && images.length > 0) {
    // Download and upload each image to Bluesky
    const uploaded: AppBskyEmbedImages.Image[] = [];
    for (const url of images.slice(0, 4)) { // Bluesky supports up to 4 images
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      // Check file size (response.data is a Buffer or ArrayBuffer)
      const size = response.data.byteLength !== undefined
        ? response.data.byteLength
        : response.data.length;
      if (size > 1_000_000) { // 976.56KB = 1,000,000 bytes (approx)
        console.warn(`Skipping image at ${url}: size ${size} bytes exceeds Bluesky limit (976.56KB)`);
        continue;
      }
      const mimeType = response.headers['content-type'] || 'image/jpeg';
      if (!mimeType.startsWith('image/')) {
        console.warn(`Skipping file at ${url}: type ${mimeType} is not an image.`);
        continue;
      }
      const imgRes = await agent.uploadBlob(response.data, { encoding: mimeType });
      console.log('uploadBlob result:', JSON.stringify(imgRes, null, 2));
      uploaded.push({
        $type: 'app.bsky.embed.images#image' as const,
        image: imgRes.data.blob,
        alt: '',
      });
    }
    embed = {
      $type: 'app.bsky.embed.images',
      images: uploaded,
    } as $Typed<AppBskyEmbedImages.Main>;
    console.dir(embed, { depth: null });
    // embed is now correctly typed as AppBskyEmbedImages.Main
  }
  await agent.post({ text, embed });
  console.log('Posted to Bluesky:', text, images?.length ? `with ${images.length} image(s)` : '');
}

