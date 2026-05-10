import { setupWSConnection } from 'y-websocket/bin/utils';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';

export function setupYjsConnection(
  ws: WebSocket,
  req: IncomingMessage,
  docName: string
) {
  setupWSConnection(ws, req, { docName });
}
