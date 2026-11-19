import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { profiles, userSettings } from '../db/schema.ts';
import { verifyBearerToken } from './middleware/auth.ts';
import {
  getConversationMemberIds,
  getConversationPeerIds,
  requireConversationMember,
} from './services/chatService.ts';
import type { RealtimeEvent } from '../types/chat.ts';

interface SocketMeta {
  userId: string;
  displayName: string;
}

const userSockets = new Map<string, Set<WebSocket>>();
const socketMeta = new WeakMap<WebSocket, SocketMeta>();

function safeSend(ws: WebSocket, event: RealtimeEvent) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

export function broadcastToUsers(userIds: string[], event: RealtimeEvent) {
  const unique = new Set(userIds);
  for (const uid of unique) {
    const sockets = userSockets.get(uid);
    if (!sockets) continue;
    for (const ws of sockets) {
      safeSend(ws, event);
    }
  }
}

export async function broadcastToConversation(
  conversationId: string,
  event: RealtimeEvent,
  excludeUserId?: string
) {
  const memberIds = await getConversationMemberIds(conversationId);
  const targets = excludeUserId ? memberIds.filter((id) => id !== excludeUserId) : memberIds;
  broadcastToUsers(targets, event);
}

export function broadcastToAllConnected(event: RealtimeEvent) {
  for (const sockets of userSockets.values()) {
    for (const ws of sockets) {
      safeSend(ws, event);
    }
  }
}

export function disconnectUserSockets(userId: string, reason = 'Account suspended') {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  for (const ws of sockets) {
    try {
      ws.close(4003, reason);
    } catch {
      // ignore
    }
  }
  userSockets.delete(userId);
}

async function setUserPresence(userId: string, status: 'online' | 'offline') {
  try {
    const now = new Date();
    await db
      .update(profiles)
      .set({ status, lastSeenAt: now, updatedAt: now })
      .where(eq(profiles.id, userId));

    const settingsRows = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    const showOnline = settingsRows[0] ? settingsRows[0].showOnlineStatus : true;
    const showLastSeen = settingsRows[0] ? settingsRows[0].showLastSeen : true;

    const peerIds = await getConversationPeerIds(userId);
    if (peerIds.length > 0) {
      broadcastToUsers(peerIds, {
        type: 'presence:update',
        userId,
        status: showOnline ? status : 'offline',
        lastSeenAt: showLastSeen ? now.toISOString() : '',
      });
    }
  } catch (error) {
    console.error('setUserPresence failed:', error);
  }
}

export function attachRealtimeServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) {
        ws.close(4001, 'Missing authentication token');
        return;
      }

      const { profile } = await verifyBearerToken(token);
      const userId = profile.id;
      const meta: SocketMeta = { userId, displayName: profile.displayName };
      socketMeta.set(ws, meta);

      let set = userSockets.get(userId);
      const wasOffline = !set || set.size === 0;
      if (!set) {
        set = new Set();
        userSockets.set(userId, set);
      }
      set.add(ws);

      safeSend(ws, { type: 'connected', userId });

      if (wasOffline) {
        void setUserPresence(userId, 'online');
      }

      ws.on('message', async (raw) => {
        try {
          const parsed = JSON.parse(raw.toString()) as {
            type?: string;
            conversationId?: string;
          };

          if (
            (parsed.type === 'typing:start' || parsed.type === 'typing:stop') &&
            typeof parsed.conversationId === 'string'
          ) {
            await requireConversationMember(parsed.conversationId, userId);
            await broadcastToConversation(
              parsed.conversationId,
              {
                type: 'typing:update',
                conversationId: parsed.conversationId,
                userId,
                displayName: meta.displayName,
                isTyping: parsed.type === 'typing:start',
              },
              userId
            );
          } else if (parsed.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch {
          // Ignore malformed ephemeral socket frames
        }
      });

      ws.on('close', () => {
        const currentSet = userSockets.get(userId);
        if (!currentSet) return;
        currentSet.delete(ws);
        if (currentSet.size === 0) {
          userSockets.delete(userId);
          void setUserPresence(userId, 'offline');
        }
      });
    } catch (error) {
      console.error('WebSocket auth failed:', error);
      ws.close(4003, 'Unauthorized');
    }
  });

  return wss;
}
