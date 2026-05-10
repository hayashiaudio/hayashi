import { describe, it, expect } from 'vitest';
import { server, wss } from './server.js';

describe('server', () => {
  it('creates an HTTP server', () => {
    expect(server).toBeDefined();
  });

  it('creates a WebSocket server', () => {
    expect(wss).toBeDefined();
  });

  it('has a WebSocket server attached to the HTTP server', () => {
    expect(wss.options.server).toBe(server);
  });
});
