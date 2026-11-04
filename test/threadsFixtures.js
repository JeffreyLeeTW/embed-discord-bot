export const THREADS_COMPONENT = {
  type: 17,
  components: [
    {
      type: 9,
      components: [
        {
          type: 10,
          content: '### [@example](https://www.threads.com/@example)',
        },
        { type: 10, content: 'Post text <with> escapes' },
      ],
      accessory: { type: 11, media: { url: 'https://example.com/a.jpg' } },
    },
    { type: 12, items: [{ media: { url: 'https://example.com/0.mp4' } }] },
  ],
};

export function createThreadsHtml(component = THREADS_COMPONENT) {
  const json = JSON.stringify({ component }).replace(/</g, '\\u003c');
  return `<html><head><meta property="og:title" content="x">
<script id="discord:component-embed" type="application/json">${json}</script>
</head></html>`;
}
