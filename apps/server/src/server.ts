import { createServer } from 'http';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { getRequestListener } from '@hono/node-server';
import { setupYjsConnection } from './yjs/connection.js';
import { hasDatabaseUrl } from './db/index.js';
import { handleMidiBridgeConnection } from './midiRelay.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const { app } = await import('./routes.js');

const server = createServer(getRequestListener(app.fetch));
const wss = new WebSocketServer({ server });

wss.on('connection', async (ws, req) => {
  const url = req.url ?? '';
  console.log('[Hayashi] RAW WS URL:', url, 'from:', req.socket.remoteAddress);

  if (url.startsWith('/hayashi-bridge')) {
    console.log('[Hayashi] MIDI relay connect from:', req.socket.remoteAddress);
    ws.on('error', (err) => console.error('[Hayashi] MIDI relay WS error:', err.message));
    ws.on('close', () => console.log('[Hayashi] MIDI relay close'));
    handleMidiBridgeConnection(ws);
    return;
  }

  const docName = decodeURIComponent(url.slice(1) ?? 'default');
  console.log('[Hayashi] WS connect:', docName, 'from:', req.socket.remoteAddress);
  ws.on('error', (err) => console.error('[Hayashi] WS error:', docName, err.message));
  ws.on('close', () => console.log('[Hayashi] WS close:', docName));
  await setupYjsConnection(ws, req, docName);
});

const PORT = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT) : 3001;
const HOST = process.env.SERVER_HOST ?? '0.0.0.0';
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, HOST, () => {
    console.log(`Server running on ${HOST}:${PORT} (${hasDatabaseUrl() ? 'billing: postgres' : 'billing: file'})`);
  });
}

export { app, server, wss };
