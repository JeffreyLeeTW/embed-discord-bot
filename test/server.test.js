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
import { createHash, webcrypto } from 'node:crypto';
import sinon from 'sinon';
import server from '../src/server.js';

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
            userHash: createHash('sha256')
              .update('user-id')
              .digest('hex')
              .slice(0, 16),
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
