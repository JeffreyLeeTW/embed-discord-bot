/**
 * The core server that runs on a Cloudflare worker.
 */

import { AutoRouter } from 'itty-router';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from 'discord-interactions';
import {
  FIX_COMMAND,
  FIX_MESSAGE_COMMAND,
  INVITE_COMMAND,
} from './commands.js';
import { getFixedEmbedUrls, SUPPORTED_PLATFORMS } from './linkFixer.js';
import {
  countComponents,
  fetchThreadsComponent,
  isThreadsEmbedUrl,
} from './threadsEmbed.js';

const DISCORD_API_URL = 'https://discord.com/api/v10';
const IS_COMPONENTS_V2_FLAG = 1 << 15;
const MAX_MESSAGE_COMPONENTS = 40;
const NO_MENTIONS = { parse: [] };

class JsonResponse extends Response {
  constructor(body, init) {
    const jsonBody = JSON.stringify(body);
    const headers = new Headers(init?.headers);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json;charset=UTF-8');
    }
    super(jsonBody, { ...init, headers });
  }
}

const router = AutoRouter();

/**
 * A simple :wave: hello page to verify the worker is working.
 */
router.get('/', (request, env) => {
  return new Response(`👋 ${env.DISCORD_APPLICATION_ID}`);
});

/**
 * Main route for all requests sent from Discord.  All incoming messages will
 * include a JSON payload described here:
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 */
router.post('/', async (request, env, ctx) => {
  const { isValid, interaction } = await server.verifyDiscordRequest(
    request,
    env,
  );
  if (!isValid || !interaction) {
    return new Response('Bad request signature.', { status: 401 });
  }

  if (interaction.type === InteractionType.PING) {
    // The `PING` message is used during the initial webhook handshake, and is
    // required to configure the webhook in the developer portal.
    return new JsonResponse({
      type: InteractionResponseType.PONG,
    });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    // Most user commands will come as `APPLICATION_COMMAND`.
    switch (interaction.data.name.toLowerCase()) {
      case INVITE_COMMAND.name.toLowerCase(): {
        const applicationId = env.DISCORD_APPLICATION_ID;
        const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=applications.commands`;
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: INVITE_URL,
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
      case FIX_COMMAND.name.toLowerCase(): {
        const fixedUrls = getFixedEmbedUrls(getFixCommandInput(interaction));
        logFixCommandUsage(interaction, fixedUrls.length);
        return createFixResponse(fixedUrls, interaction, env, ctx);
      }
      case FIX_MESSAGE_COMMAND.name.toLowerCase(): {
        return createFixResponse(
          getFixedEmbedUrls(getMessageCommandInput(interaction)),
          interaction,
          env,
          ctx,
        );
      }
      default:
        return createEphemeralResponse('Unknown command.');
    }
  }

  console.error('Unknown Type');
  return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
});
router.all('*', () => new Response('Not Found.', { status: 404 }));

async function verifyDiscordRequest(request, env) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();
  const isValidRequest =
    signature &&
    timestamp &&
    (await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY));
  if (!isValidRequest) {
    return { isValid: false };
  }

  return { interaction: JSON.parse(body), isValid: true };
}

function createFixResponse(fixedUrls, interaction, env, ctx) {
  if (!fixedUrls.length) {
    return createEphemeralResponse(
      `No supported ${SUPPORTED_PLATFORMS} links found.`,
    );
  }

  // Fetching fixthreads takes about as long as Discord's 3 second response
  // window, so defer and finish the reply in the background.
  if (ctx && fixedUrls.some(isThreadsEmbedUrl)) {
    ctx.waitUntil(server.sendThreadsEmbeds(fixedUrls, interaction, env));
    return new JsonResponse({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });
  }

  return new JsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: fixedUrls.join('\n'),
    },
  });
}

/**
 * Completes a deferred fix reply: Threads links become Components V2
 * containers, and anything that can't (other platforms, failed fetches,
 * overflow past the component cap) is sent as plain links.
 */
async function sendThreadsEmbeds(fixedUrls, interaction, env) {
  const webhookUrl = `${DISCORD_API_URL}/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}`;
  const fetchedComponents = await Promise.all(
    fixedUrls.map((url) =>
      isThreadsEmbedUrl(url) ? fetchThreadsComponent(url) : null,
    ),
  );

  const containers = [];
  const plainUrls = [];
  let componentCount = 0;
  fixedUrls.forEach((url, index) => {
    const component = fetchedComponents[index];
    const size = component ? countComponents(component) : 0;
    if (component && componentCount + size <= MAX_MESSAGE_COMPONENTS) {
      containers.push(component);
      componentCount += size;
    } else {
      plainUrls.push(url);
    }
  });

  try {
    if (!containers.length) {
      await sendWebhookMessage(`${webhookUrl}/messages/@original`, 'PATCH', {
        content: plainUrls.join('\n'),
        allowed_mentions: NO_MENTIONS,
      });
      return;
    }

    await sendWebhookMessage(`${webhookUrl}/messages/@original`, 'PATCH', {
      flags: IS_COMPONENTS_V2_FLAG,
      components: containers,
      allowed_mentions: NO_MENTIONS,
    });
    if (plainUrls.length) {
      // A Components V2 message can't carry content, so other links go in a
      // follow-up where Discord can unfurl them.
      await sendWebhookMessage(webhookUrl, 'POST', {
        content: plainUrls.join('\n'),
        allowed_mentions: NO_MENTIONS,
      });
    }
  } catch (error) {
    console.error({
      event: 'threads_embed_send_failed',
      message: error.message,
    });
    // Never leave the deferred reply stuck on "thinking".
    await sendWebhookMessage(`${webhookUrl}/messages/@original`, 'PATCH', {
      content: fixedUrls.join('\n'),
      allowed_mentions: NO_MENTIONS,
    }).catch(() => {});
  }
}

async function sendWebhookMessage(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Discord webhook ${method} failed: ${response.status}`);
  }
}

function createEphemeralResponse(content) {
  return new JsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      flags: InteractionResponseFlags.EPHEMERAL,
    },
  });
}

function getFixCommandInput(interaction) {
  return (
    interaction.data.options?.find((option) => option.name === 'url')?.value ||
    ''
  );
}

function getMessageCommandInput(interaction) {
  const targetId = interaction.data.target_id;
  return interaction.data.resolved?.messages?.[targetId]?.content || '';
}

function logFixCommandUsage(interaction, fixedUrlCount) {
  console.info({
    event: 'discord_fix_command_used',
    command: FIX_COMMAND.name,
    guildId: interaction.guild_id || null,
    channelId: interaction.channel_id || null,
    fixedUrlCount,
    foundSupportedLinks: fixedUrlCount > 0,
  });
}

const server = {
  verifyDiscordRequest,
  sendThreadsEmbeds,
  fetch: router.fetch,
};

export default server;
