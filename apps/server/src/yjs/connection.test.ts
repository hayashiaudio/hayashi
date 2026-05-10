import { describe, it, expect } from 'vitest';
import { setupYjsConnection } from './connection.js';

describe('setupYjsConnection', () => {
  it('is a function that accepts ws, req, and docName', () => {
    expect(typeof setupYjsConnection).toBe('function');
    expect(setupYjsConnection.length).toBe(3);
  });

  it('does not throw with a mocked WebSocket-like object', () => {
    const mockWs = {
      on: () => {},
      close: () => {},
    } as unknown as import('ws').WebSocket;

    const mockReq = {} as import('http').IncomingMessage;
    const docName = 'test-doc';

    expect(() => setupYjsConnection(mockWs, mockReq, docName)).not.toThrow();
  });
});