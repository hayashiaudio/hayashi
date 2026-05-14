import { midiEngine, type MidiPacket } from './midiEngine';
import { getMidiBridgeUrl } from '@/lib/constants';

export interface MidiBridgeMessage {
  type: 'midi' | 'pair' | 'pair_ack' | 'pair_nak' | 'ping';
  pairingId: string;
  packet?: MidiPacket;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

const WS_URL = getMidiBridgeUrl();
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

let ws: WebSocket | null = null;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const activePairingIds = new Set<string>();
let status: ConnectionStatus = 'disconnected';
const statusListeners = new Set<(status: ConnectionStatus) => void>();

function setStatus(next: ConnectionStatus) {
  status = next;
  for (const fn of statusListeners) {
    fn(next);
  }
}

export function getMidiBridgeStatus(): ConnectionStatus {
  return status;
}

export function subscribeMidiBridgeStatus(fn: (status: ConnectionStatus) => void): () => void {
  statusListeners.add(fn);
  fn(status);
  return () => {
    statusListeners.delete(fn);
  };
}

function getReconnectDelay(): number {
  const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
  return delay + Math.random() * 500; // jitter
}

function connect() {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
    return;
  }

  setStatus('connecting');
  try {
    ws = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectAttempt = 0;
    for (const id of activePairingIds) {
      sendPair(id);
    }
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data) as MidiBridgeMessage;
      if (!msg || typeof msg !== 'object') return;

      switch (msg.type) {
        case 'pair_ack': {
          setStatus('connected');
          break;
        }
        case 'pair_nak': {
          activePairingIds.delete(msg.pairingId);
          if (activePairingIds.size === 0) {
            setStatus('disconnected');
          }
          break;
        }
        case 'midi': {
          if (msg.packet && activePairingIds.has(msg.pairingId)) {
            midiEngine.handleMidiPacket(msg.packet);
          }
          break;
        }
        case 'ping': {
          ws?.send(JSON.stringify({ type: 'pong', pairingId: msg.pairingId }));
          break;
        }
      }
    } catch {
      // ignore malformed messages
    }
  };

  ws.onclose = () => {
    ws = null;
    if (activePairingIds.size > 0) {
      setStatus('connecting');
      scheduleReconnect();
    } else {
      setStatus('disconnected');
    }
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  const delay = getReconnectDelay();
  reconnectAttempt++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function sendPair(pairingId: string) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const msg: MidiBridgeMessage = { type: 'pair', pairingId };
  ws.send(JSON.stringify(msg));
}

export function pairSession(pairingId: string) {
  activePairingIds.add(pairingId);
  connect();
  if (ws?.readyState === WebSocket.OPEN) {
    sendPair(pairingId);
  }
}

export function unpairSession(pairingId: string) {
  activePairingIds.delete(pairingId);
  if (activePairingIds.size === 0) {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    reconnectAttempt = 0;
    setStatus('disconnected');
  }
}

export function disconnect() {
  activePairingIds.clear();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  reconnectAttempt = 0;
  setStatus('disconnected');
}
