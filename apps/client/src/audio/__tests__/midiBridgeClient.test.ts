import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock midiEngine before importing midiBridgeClient
// Use inline mock factory without referencing outer variables
vi.mock('@/audio/midiEngine', () => ({
  midiEngine: {
    handleMidiPacket: vi.fn(),
  },
}));

import {
  pairSession,
  unpairSession,
  disconnect,
  subscribeMidiBridgeStatus,
  getMidiBridgeStatus,
} from '@/audio/midiBridgeClient';

describe('midiBridgeClient', () => {
  beforeEach(() => {
    disconnect();
  });

  afterEach(() => {
    disconnect();
    vi.unstubAllGlobals();
  });

  it('starts disconnected', () => {
    expect(getMidiBridgeStatus()).toBe('disconnected');
  });

  it('transitions to connecting on pairSession', () => {
    expect(getMidiBridgeStatus()).toBe('disconnected');
    pairSession('calm-river-9137');
    expect(getMidiBridgeStatus()).toBe('connecting');
  });

  it('notifies status subscribers immediately and on change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMidiBridgeStatus(listener);

    // Called immediately with current status
    expect(listener).toHaveBeenCalledWith('disconnected');
    expect(listener).toHaveBeenCalledTimes(1);

    pairSession('test-code-1234');
    expect(listener).toHaveBeenCalledWith('connecting');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('does not notify unsubscribed listeners', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMidiBridgeStatus(listener);
    unsubscribe();

    listener.mockClear();
    pairSession('test-code-1234');
    expect(listener).not.toHaveBeenCalled();
  });

  it('resets to disconnected after unpairSession', () => {
    pairSession('test-code-1234');
    expect(getMidiBridgeStatus()).toBe('connecting');

    unpairSession('test-code-1234');
    expect(getMidiBridgeStatus()).toBe('disconnected');
  });

  it('stays connected if other pairings exist after unpair', () => {
    pairSession('code-a-1111');
    pairSession('code-b-2222');
    expect(getMidiBridgeStatus()).toBe('connecting');

    unpairSession('code-a-1111');
    expect(getMidiBridgeStatus()).toBe('connecting');

    unpairSession('code-b-2222');
    expect(getMidiBridgeStatus()).toBe('disconnected');
  });

  it('disconnect resets all state', () => {
    pairSession('test-code-1234');
    expect(getMidiBridgeStatus()).toBe('connecting');

    disconnect();
    expect(getMidiBridgeStatus()).toBe('disconnected');
  });
});
