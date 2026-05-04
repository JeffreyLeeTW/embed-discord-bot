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

const HOST_REPLACEMENTS = new Map([
  ['facebook.com', 'facebed.com'],
  ['fb.watch', 'facebed.com'],
  ['instagram.com', 'ddinstagram.com'],
  ['threads.com', 'fixthreads.seria.moe'],
  ['threads.net', 'fixthreads.seria.moe'],
  ['twitter.com', 'fixvx.com'],
  ['x.com', 'fixvx.com'],
]);

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
  const normalizedHost = hostname.toLowerCase().replace(/^www\./, '');
  const withoutMobilePrefix = normalizedHost.replace(/^m\./, '');

  return (
    HOST_REPLACEMENTS.get(normalizedHost) ||
    HOST_REPLACEMENTS.get(withoutMobilePrefix) ||
    null
  );
}

function removeTrackingParams(url) {
  for (const param of [...url.searchParams.keys()]) {
    const lowerParam = param.toLowerCase();

    if (lowerParam.startsWith('utm_') || TRACKING_PARAMS.has(lowerParam)) {
      url.searchParams.delete(param);
    }
  }
}
