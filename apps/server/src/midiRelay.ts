import type { WebSocket } from 'ws';

interface RelayRoom {
  sockets: Set<WebSocket>;
}

const rooms = new Map<string, RelayRoom>();
const socketRooms = new Map<WebSocket, Set<string>>();

export function handleMidiBridgeConnection(ws: WebSocket) {
  socketRooms.set(ws, new Set());

  ws.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
    try {
      const text =
        typeof raw === 'string'
          ? raw
          : Buffer.isBuffer(raw)
            ? raw.toString('utf-8')
            : Buffer.from(raw as ArrayBuffer).toString('utf-8');

      console.log('[Hayashi] MIDI relay raw:', text);

      const msg = JSON.parse(text);
      if (!msg || typeof msg !== 'object') return;

      const pairingId = (msg.pairingId ?? msg.pairing_id) as string | undefined;
      if (!pairingId) return;

      switch (msg.type) {
        case 'pair': {
          let room = rooms.get(pairingId);
          if (!room) {
            room = { sockets: new Set() };
            rooms.set(pairingId, room);
          }
          room.sockets.add(ws);
          socketRooms.get(ws)?.add(pairingId);

          console.log('[Hayashi] MIDI relay pair:', pairingId, 'room size:', room.sockets.size);

          if (room.sockets.size >= 2) {
            const ack = JSON.stringify({ type: 'pair_ack', pairingId });
            for (const peer of room.sockets) {
              if (peer.readyState === 1) {
                peer.send(ack);
              }
            }
            console.log('[Hayashi] MIDI relay pair_ack sent to', room.sockets.size, 'peers for', pairingId);
          }
          break;
        }
        case 'midi': {
          const room = rooms.get(pairingId);
          if (!room) return;
          const relay = JSON.stringify({
            type: 'midi',
            pairingId,
            packet: msg.packet,
          });
          for (const peer of room.sockets) {
            if (peer !== ws && peer.readyState === 1) {
              peer.send(relay);
            }
          }
          break;
        }
        case 'pong': {
          const room = rooms.get(pairingId);
          if (!room) return;
          const relay = JSON.stringify({ type: 'pong', pairingId });
          for (const peer of room.sockets) {
            if (peer !== ws && peer.readyState === 1) {
              peer.send(relay);
            }
          }
          break;
        }
        case 'ping': {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'pong', pairingId }));
          }
          break;
        }
        default: {
          const room = rooms.get(pairingId);
          if (!room) return;
          for (const peer of room.sockets) {
            if (peer !== ws && peer.readyState === 1) {
              peer.send(text);
            }
          }
        }
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.on('close', () => {
    const pairingIds = socketRooms.get(ws);
    if (pairingIds) {
      for (const pairingId of pairingIds) {
        const room = rooms.get(pairingId);
        if (room) {
          const hadTwo = room.sockets.size >= 2;
          room.sockets.delete(ws);
          console.log('[Hayashi] MIDI relay peer left:', pairingId, 'room size:', room.sockets.size);
          if (room.sockets.size === 0) {
            rooms.delete(pairingId);
          } else if (hadTwo && room.sockets.size < 2) {
            const nak = JSON.stringify({ type: 'pair_nak', pairingId });
            for (const peer of room.sockets) {
              if (peer.readyState === 1) {
                peer.send(nak);
              }
            }
            console.log('[Hayashi] MIDI relay pair_nak sent to remaining peer for', pairingId);
          }
        }
      }
      socketRooms.delete(ws);
    }
  });

  ws.on('error', (err: Error) => {
    console.error('[Hayashi] MIDI relay WS error:', err.message);
  });
}
