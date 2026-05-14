import * as ywsUtils from 'y-websocket/bin/utils';
import * as Y from 'yjs';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { eq, asc } from 'drizzle-orm';
import { getDb, ensureDbSchema, hasDatabaseUrl } from '../db/index.js';
import { yjsUpdates } from '../db/schema.js';

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

    if (hasDatabaseUrl()) {
      try {
        await ensureDbSchema();
        const db = getDb();

        const rows = await db
          .select()
          .from(yjsUpdates)
          .where(eq(yjsUpdates.docName, docName))
          .orderBy(asc(yjsUpdates.id));

        for (const row of rows) {
          Y.applyUpdate(doc, Buffer.from(row.updateData, 'base64'));
        }

        doc.on('update', async (update: Uint8Array) => {
          try {
            await db.insert(yjsUpdates).values({
              docName,
              updateData: Buffer.from(update).toString('base64'),
              createdAt: Date.now(),
            });
          } catch (err) {
            console.error('[Hayashi] Failed to persist Yjs update:', docName, err);
          }
        });
      } catch (err) {
        console.error('[Hayashi] Failed to hydrate Yjs doc from DB:', docName, err);
      }
    }
  }

  setupWSConnection(ws, req, { docName });
}
