import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthToken } from '../lib/api';
import type { RealtimeEvent } from '../types/chat';

export function useRealtime(
  enabled: boolean,
  onEvent: (event: RealtimeEvent) => void
) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) {
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      return;
    }

    let disposed = false;
    let reconnectTimer: number | undefined;
    let heartbeatTimer: number | undefined;
    let attempt = 0;

    const connect = async () => {
      if (disposed) return;
      try {
        const token = await getAuthToken();
        if (disposed) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (disposed) {
            ws.close();
            return;
          }
          attempt = 0;
          setConnected(true);
          heartbeatTimer = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 25000);
        };

        ws.onmessage = (ev) => {
          try {
            const event = JSON.parse(ev.data) as RealtimeEvent;
            onEventRef.current(event);
          } catch {
            // Ignore non-JSON frames
          }
        };

        ws.onclose = () => {
          setConnected(false);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          if (!disposed) {
            const delay = Math.min(1000 * 2 ** attempt, 12000);
            attempt += 1;
            reconnectTimer = window.setTimeout(connect, delay);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        if (!disposed) {
          const delay = Math.min(1500 * 2 ** attempt, 12000);
          attempt += 1;
          reconnectTimer = window.setTimeout(connect, delay);
        }
      }
    };

    void connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled]);

  const sendTyping = useCallback((conversationId: string, isTyping: boolean) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: isTyping ? 'typing:start' : 'typing:stop',
          conversationId,
        })
      );
    }
  }, []);

  return { connected, sendTyping };
}
