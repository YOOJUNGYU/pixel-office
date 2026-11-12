import type { ServerMessage } from '../../../core/src/messages.js';
import type { MessageTransport } from './types.js';
import { WebSocketTransport } from './webSocketTransport.js';

function createTransport(): MessageTransport {
  // Connect via WebSocket to the same host serving the SPA. Whether this
  // session may change anything is decided server-side (httpServer.isLoopback).
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // A popout window (?transcript=<id>, or the usage window ?usage) has its own socket: the
  // page's /ws keeps one UI at a time and would close the office window.
  const q = new URLSearchParams(window.location.search);
  const route = q.has('transcript') || q.has('usage') ? '/ws/transcript' : '/ws';
  const wsUrl = `${protocol}//${window.location.host}${route}`;
  const ws = new WebSocketTransport(wsUrl);
  // Vite dev only: there is no server to connect to, so `browserMock` injects
  // ServerMessages as `window` 'message' events. Bridge them into the transport
  // and DON'T open a real socket — there is no /ws on the Vite dev server, so
  // the transport would loop on reconnect. Guarded by DEV so it's tree-shaken
  // out of the production standalone build. Exactly ONE connect() call must
  // remain: WebSocketTransport has no guard, and a second call orphans a live
  // socket whose handlers keep delivering every broadcast a second time.
  if (import.meta.env.DEV) {
    window.addEventListener('message', (e: MessageEvent) => {
      const data = e.data as unknown;
      if (
        data &&
        typeof data === 'object' &&
        typeof (data as { type?: unknown }).type === 'string'
      ) {
        ws.deliver(data as ServerMessage);
      }
    });
  } else {
    ws.connect();
  }
  return ws;
}

/** Singleton transport instance. */
export const transport: MessageTransport = createTransport();
export type { MessageTransport } from './types.js';
