import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from './routes.js';
import { rmSync, existsSync } from 'fs';
import { resolve } from 'path';

const TEST_PROJECTS_DIR = '/tmp/hayashi/projects';
const TEST_ASSETS_DIR = '/tmp/hayashi/assets';
const TEST_BILLING_DIR = '/tmp/hayashi/billing';

describe('routes', () => {
  beforeEach(() => {
    // Clean up test directories before each test
    if (existsSync(TEST_PROJECTS_DIR)) {
      rmSync(TEST_PROJECTS_DIR, { recursive: true });
    }
    if (existsSync(TEST_ASSETS_DIR)) {
      rmSync(TEST_ASSETS_DIR, { recursive: true });
    }
    if (existsSync(TEST_BILLING_DIR)) {
      rmSync(TEST_BILLING_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up after each test
    if (existsSync(TEST_PROJECTS_DIR)) {
      rmSync(TEST_PROJECTS_DIR, { recursive: true });
    }
    if (existsSync(TEST_ASSETS_DIR)) {
      rmSync(TEST_ASSETS_DIR, { recursive: true });
    }
    if (existsSync(TEST_BILLING_DIR)) {
      rmSync(TEST_BILLING_DIR, { recursive: true });
    }
  });

  describe('GET /health', () => {
    it('returns ok status and music-lab mode', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: 'ok', mode: 'music-lab' });
    });
  });

  describe('POST /project/save', () => {
    const mockDiscordUser = {
      id: 'discord-user-1',
      username: 'hayashi',
      global_name: 'Hayashi Tester',
      avatar: null,
    };

    function withMockIdentity(test: () => Promise<void>) {
      return async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (input: string | URL | Request) => {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
          if (url.includes('/users/@me')) {
            return new Response(JSON.stringify(mockDiscordUser), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return originalFetch(input);
        }) as typeof fetch;

        try {
          await test();
        } finally {
          globalThis.fetch = originalFetch;
        }
      };
    }

    it('returns 400 when accessToken is missing', async () => {
      const res = await app.request('/project/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'test', snapshot: {} }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Missing accessToken, projectId, or snapshot');
    });

    it(
      'saves a project snapshot and returns success',
      withMockIdentity(async () => {
        const projectId = 'test-project-1';
        const snapshot = { projectTitle: 'Test Jam', bpm: 128 };

        const res = await app.request('/project/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: 'discord-token', projectId, snapshot }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.saved).toBe(true);
      })
    );

    it(
      'returns 401 with invalid accessToken',
      withMockIdentity(async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () =>
          new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })) as typeof fetch;

        try {
          const res = await app.request('/project/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: 'bad-token', projectId: 'test', snapshot: {} }),
          });

          expect(res.status).toBe(401);
        } finally {
          globalThis.fetch = originalFetch;
        }
      })
    );
  });

  describe('GET /project/load/:projectId', () => {
    it('returns 400 when accessToken is missing', async () => {
      const res = await app.request('/project/load/test');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Missing accessToken');
    });
  });

  describe('GET /projects/list', () => {
    it('returns 400 when accessToken is missing', async () => {
      const res = await app.request('/projects/list');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Missing accessToken');
    });
  });

  describe('POST /assets/upload', () => {
    it('uploads an asset and returns assetId and url', async () => {
      const buffer = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // "RIFF"

      const res = await app.request('/assets/upload', {
        method: 'POST',
        body: buffer,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.assetId).toBeDefined();
      expect(body.url).toContain('/assets/');
    });
  });

  describe('POST /discord/token', () => {
    it('returns 400 when code is missing', async () => {
      const res = await app.request('/discord/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Missing Discord authorization code');
    });

    it('returns exchanged access token on success', async () => {
      const originalFetch = globalThis.fetch;
      process.env.DISCORD_CLIENT_ID = 'discord-client-id';
      process.env.DISCORD_CLIENT_SECRET = 'discord-client-secret';

      globalThis.fetch = (async () =>
        new Response(JSON.stringify({
          access_token: 'discord-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'identify',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })) as typeof fetch;

      try {
        const res = await app.request('/discord/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'discord-auth-code' }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.access_token).toBe('discord-access-token');
        expect(body.scope).toBe('identify');
      } finally {
        globalThis.fetch = originalFetch;
        delete process.env.DISCORD_CLIENT_ID;
        delete process.env.DISCORD_CLIENT_SECRET;
      }
    });
  });

  describe('billing', () => {
    beforeEach(() => {
      process.env.DISCORD_CLIENT_ID = 'discord-client-id';
      process.env.DISCORD_BOT_TOKEN = 'discord-bot-token';
    });

    afterEach(() => {
      delete process.env.DISCORD_CLIENT_ID;
      delete process.env.DISCORD_BOT_TOKEN;
    });

    it('bootstraps a free user and tracks daily export limits', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/users/@me')) {
          return new Response(JSON.stringify({
            id: 'discord-user-1',
            username: 'hayashi',
            global_name: 'Hayashi Tester',
            avatar: null,
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/applications/') && url.includes('/entitlements')) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(input);
      }) as typeof fetch;

      try {
        const bootstrapRes = await app.request('/billing/bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: 'discord-token',
            guildId: 'guild-1',
            channelId: 'channel-1',
          }),
        });

        expect(bootstrapRes.status).toBe(200);
        const bootstrapBody = await bootstrapRes.json();
        expect(bootstrapBody.plan).toBe('free');
        expect(bootstrapBody.entitlements.activeNodeLimit).toBe(8);
        expect(bootstrapBody.usage.dailyExportsRemaining).toBe(3);

        for (let attempt = 1; attempt <= 3; attempt += 1) {
          const exportRes = await app.request('/billing/export/authorize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken: 'discord-token',
              guildId: 'guild-1',
              channelId: 'channel-1',
            }),
          });
          expect(exportRes.status).toBe(200);
          const exportBody = await exportRes.json();
          expect(exportBody.usage.dailyExportsUsed).toBe(attempt);
        }

        const blockedRes = await app.request('/billing/export/authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: 'discord-token',
            guildId: 'guild-1',
            channelId: 'channel-1',
          }),
        });

        expect(blockedRes.status).toBe(403);
        const blockedBody = await blockedRes.json();
        expect(blockedBody.contextAccess.reason).toBe('export_limit');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('GET /assets/:assetId', () => {
    it('returns 404 when asset does not exist', async () => {
      const res = await app.request('/assets/nonexistent');
      expect(res.status).toBe(404);
    });

    it('returns the asset content when it exists', async () => {
      const buffer = new Uint8Array([0x52, 0x49, 0x46, 0x46]);

      const uploadRes = await app.request('/assets/upload', {
        method: 'POST',
        body: buffer,
      });
      const { assetId } = await uploadRes.json();

      const res = await app.request(`/assets/${assetId}`);
      expect(res.status).toBe(200);
      const content = await res.arrayBuffer();
      expect(new Uint8Array(content)).toEqual(buffer);
    });
  });

  describe('SPA fallback', () => {
    it('returns 404 for API routes that do not match', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
    });

    it('serves root-level static files from the client dist', async () => {
      const res = await app.request('/hayashi-logo.png');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      const content = await res.arrayBuffer();
      expect(content.byteLength).toBeGreaterThan(0);
    });

    it('serves nested static runtime files from the client dist', async () => {
      const res = await app.request('/worklets/meter-processor.js');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/javascript');
      const content = await res.text();
      expect(content.length).toBeGreaterThan(0);
    });
  });
});
