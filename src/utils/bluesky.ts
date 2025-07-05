import { AtpAgent, AppBskyEmbedImages, $Typed, RichText } from '@atproto/api';

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

import { escapeBlueskyText } from './escapeBlueskyText';
// Accepts images and videos, prefers video if both present
export async function postToBluesky(text: string, images?: string[], videos?: string[], altText?: string[]) {
  const agent = await getAgent();
  let embed: $Typed<AppBskyEmbedImages.Main> | {
    $type: 'app.bsky.embed.external';
    external: {
      uri: string;
      title: string;
      description: string;
      thumb?: unknown;
    };
  } | undefined = undefined;
  // Prefer video if present
  if (videos && videos.length > 0) {
    const videoUrl = videos[0];
    embed = {
      $type: 'app.bsky.embed.external',
      external: {
        uri: videoUrl,
        title: 'Video',
        description: '',
        thumb: undefined // Optionally, you can add a thumbnail if available
      },
    };
    console.log('Posting with video external embed:', videoUrl);
  } else if (images && images.length > 0) {
    // Download and upload each image to Bluesky
    const uploaded: AppBskyEmbedImages.Image[] = [];
    for (const [i, url] of images.slice(0, 4).entries()) { // Bluesky supports up to 4 images
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
        alt: altText && altText[i] ? altText[i] : '',
      });
    }
    embed = {
      $type: 'app.bsky.embed.images',
      images: uploaded,
    } as $Typed<AppBskyEmbedImages.Main>;
    console.dir(embed, { depth: null });
    // embed is now correctly typed as AppBskyEmbedImages.Main
  }
  // Escape and normalize text before posting
  const safeText = escapeBlueskyText(text);

  // --- Add link facets for clickable links ---
  const richText = new RichText({ text: safeText });
  await richText.detectFacets(agent); // This will auto-detect URLs and add link facets

  await agent.post({ text: safeText, embed, facets: richText.facets });
  if (videos && videos.length > 0) {
    console.log('Posted to Bluesky:', text, `with video: ${videos[0]}`);
  } else {
    console.log('Posted to Bluesky:', text, images?.length ? `with ${images.length} image(s)` : '');
  }
}

