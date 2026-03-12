import type { Socket } from 'socket.io';
import { supabase } from '../supabase.js';
import type { AuthenticatedSocket } from '../types.js';

declare module 'socket.io' {
  interface Socket {
    auth: AuthenticatedSocket;
  }
}

/**
 * Socket.io middleware — verifies Supabase JWT and attaches player identity.
 * Clients must pass { token, nickname, avatarUrl } in socket.auth handshake data.
 */
export async function authenticateSocket(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  const { token, nickname, avatarUrl } = socket.handshake.auth as {
    token?: string;
    nickname?: string;
    avatarUrl?: string;
  };

  if (!token) {
    return next(new Error('AUTH_MISSING_TOKEN'));
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return next(new Error('AUTH_INVALID_TOKEN'));
  }

  if (!nickname || nickname.trim().length < 3) {
    return next(new Error('AUTH_MISSING_NICKNAME'));
  }

  socket.auth = {
    playerId: data.user.id,
    nickname: nickname.trim(),
    avatarUrl: avatarUrl ?? '',
  };

  next();
}
