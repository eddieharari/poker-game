import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@poker5o/shared';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) throw new Error('Socket not initialised — call connectSocket() first');
  return socket;
}

export function connectSocket(token: string, nickname: string, avatarUrl: string): AppSocket {
  if (socket?.connected) return socket as AppSocket;

  socket = io(import.meta.env.VITE_SERVER_URL as string, {
    auth: { token, nickname, avatarUrl },
    autoConnect: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  }) as AppSocket;

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
