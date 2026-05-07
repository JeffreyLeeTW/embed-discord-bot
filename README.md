# Embed Discord Bot

Worker-only Discord app for fixing social media links into Discord-friendly
embed URLs.

This repository is modified from Discord's
[`cloudflare-sample-app`](https://github.com/discord/cloudflare-sample-app).
The original project is MIT licensed, and this repository keeps the original
MIT license notice in [LICENSE](LICENSE). Changes in this repository remove the
sample Reddit command and adapt the Cloudflare Worker interaction flow for
social media embed fixing.

Production Worker URL:

```text
https://<yourworkerdomain>.workers.dev
```

## Features

- `/fix url:<link>` posts a fixed embed URL.
- Right-click a message, select `Apps`, then `Fix embeds` to fix links from
  that message.
- Removes common tracking parameters such as `utm_*`, `fbclid`, `igshid`,
  `gclid`, and similar IDs.

Supported replacements:

- `facebook.com` / `fb.watch` -> `www.facebed.com`
- `instagram.com` -> `www.kkinstagram.com`
- `x.com` / `twitter.com` -> `www.fixvx.com`
- `threads.net` / `threads.com` -> `fixthreads.seria.moe`

This app is intentionally Worker-only. It does not use Discord Gateway or a
long-running bot process, so Discord will only call it when a user invokes a
slash command or message context menu command.

If the `Fix embeds` message command cannot read the selected message content,
enable Message Content Intent for the Discord app. `/fix url:<link>` does not
depend on that intent.

## Setup

Install dependencies:

```sh
npm install
```

Create `.dev.vars` from `example.dev.vars` and fill in the Discord app values:

```sh
DISCORD_APPLICATION_ID="..."
DISCORD_PUBLIC_KEY="..."
DISCORD_TOKEN="..."
```

In the Discord Developer Portal, set the app's Interactions Endpoint URL to:

```text
https://<yourworkdomain>.workers.dev
```

The root path is correct because this Worker handles Discord interactions at
`POST /`.

## Register Commands

Run this after changing commands:

```sh
npm run register
```

This registers:

- `/invite`
- `/fix`
- `Fix embeds` message context menu command

## Local Development

Run the Worker locally:

```sh
npm start
```

Run tests and lint:

```sh
npm test
npm run lint
```

## Deploy

Set production secrets in Cloudflare:

```sh
wrangler secret put DISCORD_TOKEN
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put DISCORD_APPLICATION_ID
```

Deploy to Cloudflare Workers:

```sh
npm run publish
```

`wrangler.toml` is configured with `name = "discordembedbot"`, so deploys target
`https://<yourworkdomain>.workers.dev`.
