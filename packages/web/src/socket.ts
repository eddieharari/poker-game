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
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  }) as AppSocket;

  // Session lifecycle events — handled globally so they fire regardless of which page is mounted
  socket.on('session:duplicate', () => {
    // Lazy import to avoid circular dependency
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
    const stored = sessionStorage.getItem('serverBootId');
    if (stored && stored !== bootId) {
      // Server restarted — force sign out so player re-authenticates fresh
      import('./store/authStore.js').then(({ useAuthStore }) => {
        useAuthStore.getState().signOut();
      });
    } else {
      sessionStorage.setItem('serverBootId', bootId);
    }
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
