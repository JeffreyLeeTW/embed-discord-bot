export const THREADS_EMBED_HOST = 'fixthreads.seria.moe';

// fixthreads only serves embed markup to crawlers it recognizes.
const CRAWLER_USER_AGENT =
  'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)';
const FETCH_TIMEOUT_MS = 8000;
const COMPONENT_EMBED_PATTERN =
  /<script id="discord:component-embed" type="application\/json">([\s\S]*?)<\/script>/;
const CONTAINER_COMPONENT_TYPE = 17;

export function isThreadsEmbedUrl(url) {
  try {
    return new URL(url).hostname === THREADS_EMBED_HOST;
  } catch {
    return false;
  }
}

/**
 * Fetches the ready-made Components V2 container that fixthreads embeds in its
 * page, so the bot can post it directly instead of relying on Discord's
 * unfurler (fixthreads' oEmbed endpoint is broken, which drops the post text).
 */
export async function fetchThreadsComponent(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: { 'user-agent': CRAWLER_USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  return parseThreadsComponent(await response.text());
}

export function parseThreadsComponent(html) {
  const match = html.match(COMPONENT_EMBED_PATTERN);
  if (!match) {
    return null;
  }

  try {
    const component = JSON.parse(match[1])?.component;
    return component?.type === CONTAINER_COMPONENT_TYPE ? component : null;
  } catch {
    return null;
  }
}

// Discord caps a Components V2 message at 40 components, nested ones included.
export function countComponents(component) {
  const children = [
    ...(component.components || []),
    ...(component.accessory ? [component.accessory] : []),
  ];
  return 1 + children.reduce((sum, child) => sum + countComponents(child), 0);
}
