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
router.post('/', async (request, env) => {
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
        await logFixCommandUsage(interaction, fixedUrls.length);
        return createFixResponse(fixedUrls);
      }
      case FIX_MESSAGE_COMMAND.name.toLowerCase(): {
        return createFixResponse(
          getFixedEmbedUrls(getMessageCommandInput(interaction)),
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

function createFixResponse(fixedUrls) {
  if (!fixedUrls.length) {
    return createEphemeralResponse(
      `No supported ${SUPPORTED_PLATFORMS} links found.`,
    );
  }

  return new JsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: fixedUrls.join('\n'),
    },
  });
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

async function logFixCommandUsage(interaction, fixedUrlCount) {
  const user = interaction.member?.user || interaction.user || {};

  console.info({
    event: 'discord_fix_command_used',
    command: FIX_COMMAND.name,
    userHash: user.id ? await hashUserId(user.id) : null,
    guildId: interaction.guild_id || null,
    channelId: interaction.channel_id || null,
    fixedUrlCount,
    foundSupportedLinks: fixedUrlCount > 0,
  });
}

/**
 * Log a short hash instead of the raw Discord user id, so distinct users can
 * still be counted without ids or usernames appearing in plain text.
 */
async function hashUserId(userId) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(userId),
  );
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const server = {
  verifyDiscordRequest,
  fetch: router.fetch,
};

export default server;
