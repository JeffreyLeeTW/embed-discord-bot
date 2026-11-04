import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import {
  InteractionResponseType,
  InteractionType,
  InteractionResponseFlags,
} from 'discord-interactions';
import {
  FIX_COMMAND,
  FIX_MESSAGE_COMMAND,
  INVITE_COMMAND,
} from '../src/commands.js';
import { Buffer } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import sinon from 'sinon';
import server from '../src/server.js';
import { createThreadsHtml, THREADS_COMPONENT } from './threadsFixtures.js';

describe('Server', () => {
  describe('GET /', () => {
    it('should return a greeting message with the Discord application ID', async () => {
      const request = {
        method: 'GET',
        url: new URL('/', 'http://discordo.example'),
      };
      const env = { DISCORD_APPLICATION_ID: '123456789' };

      const response = await server.fetch(request, env);
      const body = await response.text();

      expect(body).to.equal('👋 123456789');
    });
  });

  describe('POST /', () => {
    let verifyDiscordRequestStub;

    beforeEach(() => {
      verifyDiscordRequestStub = sinon.stub(server, 'verifyDiscordRequest');
    });

    afterEach(() => {
      verifyDiscordRequestStub.restore();
    });

    it('should reject requests with an invalid signature', async () => {
      const request = {
        method: 'POST',
        url: new URL('/', 'http://discordo.example'),
      };

      verifyDiscordRequestStub.resolves({ isValid: false });

      const response = await server.fetch(request, {});
      expect(response.status).to.equal(401);
      expect(await response.text()).to.equal('Bad request signature.');
    });

    it('should return a JSON 400 for an unknown interaction type', async () => {
      const consoleErrorStub = sinon.stub(console, 'error');
      const request = {
        method: 'POST',
        url: new URL('/', 'http://discordo.example'),
      };

      verifyDiscordRequestStub.resolves({
        isValid: true,
        interaction: { type: 999 },
      });

      try {
        const response = await server.fetch(request, {});
        expect(response.status).to.equal(400);
        expect(response.headers.get('content-type')).to.equal(
          'application/json;charset=UTF-8',
        );
        expect(await response.json()).to.deep.equal({ error: 'Unknown Type' });
      } finally {
        consoleErrorStub.restore();
      }
    });

    it('should handle a PING interaction', async () => {
      const interaction = {
        type: InteractionType.PING,
      };

      const request = {
        method: 'POST',
        url: new URL('/', 'http://discordo.example'),
      };

      const env = {};

      verifyDiscordRequestStub.resolves({
        isValid: true,
        interaction: interaction,
      });

      const response = await server.fetch(request, env);
      const body = await response.json();
      expect(body.type).to.equal(InteractionResponseType.PONG);
    });

    it('should handle an invite command interaction', async () => {
      const interaction = {
        type: InteractionType.APPLICATION_COMMAND,
        data: {
          name: INVITE_COMMAND.name,
        },
      };

      const request = {
        method: 'POST',
        url: new URL('/', 'http://discordo.example'),
      };

      const env = {
        DISCORD_APPLICATION_ID: '123456789',
      };

      verifyDiscordRequestStub.resolves({
        isValid: true,
        interaction: interaction,
      });

      const response = await server.fetch(request, env);
      const body = await response.json();
      expect(body.type).to.equal(
        InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      );
      expect(body.data.content).to.include(
        'https://discord.com/oauth2/authorize?client_id=123456789&scope=applications.commands',
      );
      expect(body.data.flags).to.equal(InteractionResponseFlags.EPHEMERAL);
    });

    it('should handle a fix slash command interaction', async () => {
      const consoleInfoStub = sinon.stub(console, 'info');
      const interaction = {
        type: InteractionType.APPLICATION_COMMAND,
        guild_id: 'guild-id',
        channel_id: 'channel-id',
        member: {
          user: {
            id: 'user-id',
            username: 'example-user',
            global_name: 'Example User',
          },
        },
        data: {
          name: FIX_COMMAND.name,
          options: [
            {
              name: 'url',
              value:
                'https://x.com/example/status/123?utm_source=share&lang=zh',
            },
          ],
        },
      };

      try {
        const request = {
          method: 'POST',
          url: new URL('/', 'http://discordo.example'),
        };

        verifyDiscordRequestStub.resolves({
          isValid: true,
          interaction: interaction,
        });

        const response = await server.fetch(request, {});
        const body = await response.json();
        expect(body.type).to.equal(
          InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        );
        expect(body.data.content).to.equal(
          'https://www.fixvx.com/example/status/123?lang=zh',
        );
        expect(consoleInfoStub.calledOnce).to.equal(true);
        expect(consoleInfoStub.firstCall.args).to.deep.equal([
          {
            event: 'discord_fix_command_used',
            command: FIX_COMMAND.name,
            guildId: 'guild-id',
            channelId: 'channel-id',
            fixedUrlCount: 1,
            foundSupportedLinks: true,
          },
        ]);
      } finally {
        consoleInfoStub.restore();
      }
    });

    it('should handle a fix message command interaction', async () => {
      const interaction = {
        type: InteractionType.APPLICATION_COMMAND,
        data: {
          name: FIX_MESSAGE_COMMAND.name,
          target_id: 'message-id',
          resolved: {
            messages: {
              'message-id': {
                content: 'https://instagram.com/p/ABC/?igshid=tracking',
              },
            },
          },
        },
      };

      const request = {
        method: 'POST',
        url: new URL('/', 'http://discordo.example'),
      };

      verifyDiscordRequestStub.resolves({
        isValid: true,
        interaction: interaction,
      });

      const response = await server.fetch(request, {});
      const body = await response.json();
      expect(body.type).to.equal(
        InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      );
      expect(body.data.content).to.equal('https://www.kkinstagram.com/p/ABC/');
    });

    it('should return an ephemeral message when fix finds no links', async () => {
      const consoleInfoStub = sinon.stub(console, 'info');
      const interaction = {
        type: InteractionType.APPLICATION_COMMAND,
        data: {
          name: FIX_COMMAND.name,
          options: [
            {
              name: 'url',
              value: 'https://example.com/post/123?utm_source=share',
            },
          ],
        },
      };

      try {
        const request = {
          method: 'POST',
          url: new URL('/', 'http://discordo.example'),
        };

        verifyDiscordRequestStub.resolves({
          isValid: true,
          interaction: interaction,
        });

        const response = await server.fetch(request, {});
        const body = await response.json();
        expect(body.type).to.equal(
          InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        );
        expect(body.data.content).to.equal(
          'No supported Facebook, Instagram, X/Twitter, or Threads links found.',
        );
        expect(body.data.flags).to.equal(InteractionResponseFlags.EPHEMERAL);
        expect(consoleInfoStub.calledOnce).to.equal(true);
        expect(consoleInfoStub.firstCall.args[0].fixedUrlCount).to.equal(0);
        expect(consoleInfoStub.firstCall.args[0].foundSupportedLinks).to.equal(
          false,
        );
      } finally {
        consoleInfoStub.restore();
      }
    });

    it('should return an ephemeral message for an unknown command interaction', async () => {
      const interaction = {
        type: InteractionType.APPLICATION_COMMAND,
        data: {
          name: 'unknown',
        },
      };

      const request = {
        method: 'POST',
        url: new URL('/', 'http://discordo.example'),
      };

      verifyDiscordRequestStub.resolves({
        isValid: true,
        interaction: interaction,
      });

      const response = await server.fetch(request, {});
      const body = await response.json();
      expect(body.type).to.equal(
        InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      );
      expect(body.data.content).to.equal('Unknown command.');
      expect(body.data.flags).to.equal(InteractionResponseFlags.EPHEMERAL);
    });
  });

  describe('Threads embeds', () => {
    const THREADS_URL = 'https://fixthreads.seria.moe/@a/post/B';
    const WEBHOOK_URL =
      'https://discord.com/api/v10/webhooks/app-id/interaction-token';
    const env = { DISCORD_APPLICATION_ID: 'app-id' };
    const interaction = { token: 'interaction-token' };
    let fetchStub;

    beforeEach(() => {
      fetchStub = sinon.stub(globalThis, 'fetch');
      fetchStub
        .withArgs(sinon.match(/^https:\/\/discord\.com\//))
        .resolves(new Response(null, { status: 200 }));
    });

    afterEach(() => {
      sinon.restore();
    });

    function getDiscordCalls() {
      return fetchStub
        .getCalls()
        .filter((call) => call.args[0].startsWith('https://discord.com/'))
        .map((call) => ({
          url: call.args[0],
          method: call.args[1].method,
          body: JSON.parse(call.args[1].body),
        }));
    }

    it('should defer a fix command that has a Threads link', async () => {
      const sendStub = sinon.stub(server, 'sendThreadsEmbeds').resolves();
      sinon.stub(console, 'info');
      const ctx = { waitUntil: sinon.spy() };
      sinon.stub(server, 'verifyDiscordRequest').resolves({
        isValid: true,
        interaction: {
          type: InteractionType.APPLICATION_COMMAND,
          token: 'interaction-token',
          data: {
            name: FIX_COMMAND.name,
            options: [
              { name: 'url', value: 'https://www.threads.com/@a/post/B' },
            ],
          },
        },
      });

      const response = await server.fetch(
        { method: 'POST', url: new URL('/', 'http://discordo.example') },
        env,
        ctx,
      );
      const body = await response.json();

      expect(body.type).to.equal(
        InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      );
      expect(ctx.waitUntil.calledOnce).to.equal(true);
      expect(sendStub.firstCall.args[0]).to.deep.equal([THREADS_URL]);
    });

    it('should edit the reply with the Threads component', async () => {
      fetchStub
        .withArgs(THREADS_URL)
        .resolves(new Response(createThreadsHtml()));

      await server.sendThreadsEmbeds([THREADS_URL], interaction, env);

      expect(getDiscordCalls()).to.deep.equal([
        {
          url: `${WEBHOOK_URL}/messages/@original`,
          method: 'PATCH',
          body: {
            flags: 1 << 15,
            components: [THREADS_COMPONENT],
            allowed_mentions: { parse: [] },
          },
        },
      ]);
    });

    it('should send other links in a follow-up message', async () => {
      fetchStub
        .withArgs(THREADS_URL)
        .resolves(new Response(createThreadsHtml()));

      await server.sendThreadsEmbeds(
        [THREADS_URL, 'https://www.fixvx.com/a/status/1'],
        interaction,
        env,
      );

      const calls = getDiscordCalls();
      expect(calls).to.have.length(2);
      expect(calls[0].body.components).to.deep.equal([THREADS_COMPONENT]);
      expect(calls[1]).to.deep.equal({
        url: WEBHOOK_URL,
        method: 'POST',
        body: {
          content: 'https://www.fixvx.com/a/status/1',
          allowed_mentions: { parse: [] },
        },
      });
    });

    it('should fall back to plain links when fixthreads fails', async () => {
      fetchStub.withArgs(THREADS_URL).resolves(new Response('<html></html>'));

      await server.sendThreadsEmbeds([THREADS_URL], interaction, env);

      expect(getDiscordCalls()).to.deep.equal([
        {
          url: `${WEBHOOK_URL}/messages/@original`,
          method: 'PATCH',
          body: { content: THREADS_URL, allowed_mentions: { parse: [] } },
        },
      ]);
    });

    it('should fall back to plain links when Discord rejects the component', async () => {
      sinon.stub(console, 'error');
      fetchStub
        .withArgs(THREADS_URL)
        .resolves(new Response(createThreadsHtml()));
      fetchStub
        .withArgs(`${WEBHOOK_URL}/messages/@original`)
        .onFirstCall()
        .resolves(new Response(null, { status: 400 }))
        .onSecondCall()
        .resolves(new Response(null, { status: 200 }));

      await server.sendThreadsEmbeds([THREADS_URL], interaction, env);

      const calls = getDiscordCalls();
      expect(calls).to.have.length(2);
      expect(calls[1].body).to.deep.equal({
        content: THREADS_URL,
        allowed_mentions: { parse: [] },
      });
    });
  });

  describe('verifyDiscordRequest', () => {
    let privateKey;
    let publicKeyHex;

    beforeEach(async () => {
      const keyPair = await webcrypto.subtle.generateKey('Ed25519', true, [
        'sign',
        'verify',
      ]);
      privateKey = keyPair.privateKey;
      const rawPublicKey = await webcrypto.subtle.exportKey(
        'raw',
        keyPair.publicKey,
      );
      publicKeyHex = Buffer.from(rawPublicKey).toString('hex');
    });

    async function createSignedRequest(body, headers = {}) {
      const timestamp = '1700000000';
      const signature = await webcrypto.subtle.sign(
        'Ed25519',
        privateKey,
        new TextEncoder().encode(timestamp + body),
      );
      return new Request('http://discordo.example/', {
        method: 'POST',
        body,
        headers: {
          'x-signature-ed25519': Buffer.from(signature).toString('hex'),
          'x-signature-timestamp': timestamp,
          ...headers,
        },
      });
    }

    it('should accept a correctly signed request', async () => {
      const body = JSON.stringify({ type: InteractionType.PING });
      const request = await createSignedRequest(body);

      const result = await server.verifyDiscordRequest(request, {
        DISCORD_PUBLIC_KEY: publicKeyHex,
      });

      expect(result).to.deep.equal({
        isValid: true,
        interaction: { type: InteractionType.PING },
      });
    });

    it('should reject a request whose body was tampered with', async () => {
      const request = await createSignedRequest('{"type":1}');
      const tampered = new Request(request, { body: '{"type":2}' });

      const result = await server.verifyDiscordRequest(tampered, {
        DISCORD_PUBLIC_KEY: publicKeyHex,
      });

      expect(result).to.deep.equal({ isValid: false });
    });

    it('should reject a request without signature headers', async () => {
      const request = new Request('http://discordo.example/', {
        method: 'POST',
        body: '{"type":1}',
      });

      const result = await server.verifyDiscordRequest(request, {
        DISCORD_PUBLIC_KEY: publicKeyHex,
      });

      expect(result).to.deep.equal({ isValid: false });
    });
  });

  describe('All other routes', () => {
    it('should return a "Not Found" response', async () => {
      const request = {
        method: 'GET',
        url: new URL('/unknown', 'http://discordo.example'),
      };
      const response = await server.fetch(request, {});
      expect(response.status).to.equal(404);
      const body = await response.text();
      expect(body).to.equal('Not Found.');
    });
  });
});
