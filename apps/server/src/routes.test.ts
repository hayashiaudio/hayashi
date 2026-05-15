import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { app } from './routes.js';
import { rmSync, existsSync } from 'fs';
import { resolve } from 'path';

vi.mock('./auth/clerk.js', () => ({
  verifyClerkToken: vi.fn(async (token: string) => {
    if (token === 'valid-clerk-token') {
      return { userId: 'clerk-user-1', name: 'Hayashi Tester', email: 'test@example.com' };
    }
    return null;
  }),
}));

const TEST_ASSETS_DIR = '/tmp/hayashi/assets';
const TEST_BILLING_DIR = '/tmp/hayashi/billing';

describe('routes', () => {
  beforeEach(() => {
    if (existsSync(TEST_ASSETS_DIR)) {
      rmSync(TEST_ASSETS_DIR, { recursive: true });
    }
    if (existsSync(TEST_BILLING_DIR)) {
      rmSync(TEST_BILLING_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_ASSETS_DIR)) {
      rmSync(TEST_ASSETS_DIR, { recursive: true });
    }
    if (existsSync(TEST_BILLING_DIR)) {
      rmSync(TEST_BILLING_DIR, { recursive: true });
    }
  });

  describe('GET /health', () => {
    it('returns ok status and plugin-studio mode', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: 'ok', mode: 'plugin-studio' });
    });
  });

  describe('POST /assets/upload', () => {
    it.skip('uploads an asset and returns assetId and url (requires S3 credentials)', async () => {
      const buffer = new Uint8Array([0x52, 0x49, 0x46, 0x46]);

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

  describe('billing', () => {
    it('bootstraps a free user and tracks generation/export limits', async () => {
      const bootstrapRes = await app.request('/billing/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: 'valid-clerk-token' }),
      });

      expect(bootstrapRes.status).toBe(200);
      const bootstrapBody = await bootstrapRes.json();
      expect(bootstrapBody.plan).toBe('free');
      expect(bootstrapBody.entitlements.generationsPerDay).toBe(5);
      expect(bootstrapBody.entitlements.exportsPerMonth).toBe(0);
      expect(bootstrapBody.usage.dailyGenerationsRemaining).toBe(5);

      // Free users cannot export — immediately blocked
      const blockedExportRes = await app.request('/billing/export/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: 'valid-clerk-token' }),
      });

      expect(blockedExportRes.status).toBe(403);
      const blockedExportBody = await blockedExportRes.json();
      expect(blockedExportBody.contextAccess.reason).toBe('export_limit');
    });
  });

  describe('GET /assets/:assetId', () => {
    it('redirects to Tigris for nonexistent assets', async () => {
      const res = await app.request('/assets/nonexistent');
      expect(res.status).toBe(302);
    });

    it.skip('returns the asset content when it exists (requires S3 credentials)', async () => {
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
    it('returns 200 for health route', async () => {
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
