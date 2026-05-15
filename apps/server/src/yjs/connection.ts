import * as ywsUtils from 'y-websocket/bin/utils';
import * as Y from 'yjs';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';

const setupWSConnection = ywsUtils.setupWSConnection;
const docs = (ywsUtils as any).docs as Map<string, any>;
const WSSharedDoc = (ywsUtils as any).WSSharedDoc as new (name: string) => Y.Doc & { conns: Map<any, any>; name: string };

export async function setupYjsConnection(
  ws: WebSocket,
  req: IncomingMessage,
  docName: string
) {
  let doc = docs.get(docName) as (Y.Doc & { conns: Map<any, any>; name: string }) | undefined;

  if (!doc) {
    doc = new WSSharedDoc(docName);
    docs.set(docName, doc);
  }

  setupWSConnection(ws, req, { docName });
}
