const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'igsh',
  'igshid',
  'mc_cid',
  'mc_eid',
  'msclkid',
  'twclid',
  'wbraid',
]);

export const SUPPORTED_PLATFORMS = 'Facebook, Instagram, X/Twitter, or Threads';

const HOST_REPLACEMENTS = new Map([
  ['facebook.com', 'www.facebed.com'],
  ['fb.com', 'www.facebed.com'],
  ['fb.watch', 'www.facebed.com'],
  ['instagram.com', 'www.kkinstagram.com'],
  ['instagr.am', 'www.kkinstagram.com'],
  ['threads.com', 'fixthreads.seria.moe'],
  ['threads.net', 'fixthreads.seria.moe'],
  ['twitter.com', 'www.fixvx.com'],
  ['x.com', 'www.fixvx.com'],
]);

// Mobile and alternate web subdomains, e.g. m.facebook.com or mobile.x.com.
const HOST_PREFIX = /^(?:www|m|mobile|web)\./;
const URL_PATTERN = /https?:\/\/[^\s<>()]+/gi;
const TRAILING_PUNCTUATION = /[.,!?;:]+$/;

export function getFixedEmbedUrls(content) {
  if (!content) {
    return [];
  }

  const matches = content.match(URL_PATTERN) || [];
  const fixedUrls = matches
    .map((rawUrl) => fixEmbedUrl(rawUrl))
    .filter((fixedUrl) => fixedUrl);

  return [...new Set(fixedUrls)];
}

export function fixEmbedUrl(rawUrl) {
  const urlText = rawUrl.replace(TRAILING_PUNCTUATION, '');
  let url;

  try {
    url = new URL(urlText);
  } catch {
    return null;
  }

  const replacementHost = getReplacementHost(url.hostname);
  if (!replacementHost) {
    return null;
  }

  url.hostname = replacementHost;
  removeTrackingParams(url);

  const fixedUrl = url.toString();
  return fixedUrl === urlText ? null : fixedUrl;
}

function getReplacementHost(hostname) {
  const normalizedHost = hostname.toLowerCase().replace(HOST_PREFIX, '');

  return HOST_REPLACEMENTS.get(normalizedHost) || null;
}

function removeTrackingParams(url) {
  for (const param of [...url.searchParams.keys()]) {
    const lowerParam = param.toLowerCase();

    if (lowerParam.startsWith('utm_') || TRACKING_PARAMS.has(lowerParam)) {
      url.searchParams.delete(param);
    }
  }
}
