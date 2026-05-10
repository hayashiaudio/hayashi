import { createServer } from 'http';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { getRequestListener } from '@hono/node-server';
import { app } from './routes.js';
import { setupYjsConnection } from './yjs/connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const server = createServer(getRequestListener(app.fetch));
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const docName = decodeURIComponent(req.url?.slice(1) ?? 'default');
  console.log('[Hayashi] WS connect:', docName, 'from:', req.socket.remoteAddress);
  ws.on('error', (err) => console.error('[Hayashi] WS error:', docName, err.message));
  ws.on('close', () => console.log('[Hayashi] WS close:', docName));
  setupYjsConnection(ws, req, docName);
});

const PORT = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT) : 3001;
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export { app, server, wss };
