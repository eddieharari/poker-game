import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@poker5o/shared';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export { type AppSocket };

export function getSocket(): AppSocket {
  if (!socket) throw new Error('Socket not initialised — call connectSocket() first');
  return socket;
}

export function connectSocket(token: string, nickname: string, avatarUrl: string): AppSocket {
  if (socket) return socket as AppSocket;

  socket = io(import.meta.env.VITE_SERVER_URL || window.location.origin, {
    auth: { token, nickname, avatarUrl },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  }) as AppSocket;

  // Session lifecycle events — handled globally so they fire regardless of which page is mounted
  socket.on('session:duplicate', () => {
    // If the player is in a game, auto-confirm takeover to avoid getting stuck
    const inGame = window.location.pathname.startsWith('/game/') || window.location.pathname.startsWith('/pazpaz/');
    if (inGame) {
      socket!.emit('session:confirm_takeover' as any);
      return;
    }
    import('./store/authStore.js').then(({ useAuthStore }) => {
      useAuthStore.getState().setDuplicateSession(true);
    });
  });

  socket.on('session:kicked', () => {
    import('./store/authStore.js').then(({ useAuthStore }) => {
      useAuthStore.getState().signOut();
    });
  });

  socket.on('session:init', ({ bootId }) => {
    // Always update the stored bootId — if server restarted,
    // lobby:enter on reconnect re-registers the player automatically
    sessionStorage.setItem('serverBootId', bootId);
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
