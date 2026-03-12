import type { GameState } from '@poker-game/shared';

// ─── Player Identity ──────────────────────────────────────────────────────────

export interface PlayerProfile {
  id: string;         // Supabase user UUID
  nickname: string;
  avatarUrl: string;
}

// ─── Lobby ────────────────────────────────────────────────────────────────────

export type PlayerStatus = 'idle' | 'in-game' | 'invited';

export interface OnlinePlayer extends PlayerProfile {
  status: PlayerStatus;
}

// ─── Room ─────────────────────────────────────────────────────────────────────

export type RoomStatus = 'waiting' | 'active' | 'finished';

export interface RoomPlayer {
  socketId: string;
  playerId: string;
  playerName: string;
  connected: boolean;
}

export interface Room {
  roomId: string;
  player0: RoomPlayer;
  player1: RoomPlayer | null;
  gameState: GameState | null;
  status: RoomStatus;
  createdAt: number;
}

// ─── Challenge ────────────────────────────────────────────────────────────────

export interface Challenge {
  challengeId: string;
  fromId: string;
  fromNickname: string;
  fromAvatarUrl: string;
  toId: string;
  roomId: string;
  createdAt: number;
}

// ─── Socket Auth ──────────────────────────────────────────────────────────────

export interface AuthenticatedSocket {
  playerId: string;
  nickname: string;
  avatarUrl: string;
}

// ─── Socket.io Typed Events (server-side extension) ───────────────────────────

export interface LobbyServerToClientEvents {
  'lobby:players': (players: OnlinePlayer[]) => void;
  'lobby:player:joined': (player: OnlinePlayer) => void;
  'lobby:player:left': (data: { playerId: string }) => void;
  'lobby:player:status': (data: { playerId: string; status: PlayerStatus }) => void;
  'lobby:challenge:incoming': (data: { challengeId: string; from: OnlinePlayer }) => void;
  'lobby:challenge:accepted': (data: { challengeId: string; roomId: string }) => void;
  'lobby:challenge:declined': (data: { challengeId: string }) => void;
  'lobby:challenge:expired': (data: { challengeId: string }) => void;
}

export interface LobbyClientToServerEvents {
  'lobby:enter': () => void;
  'lobby:leave': () => void;
  'lobby:challenge': (data: { toPlayerId: string }) => void;
  'lobby:challenge:accept': (data: { challengeId: string }) => void;
  'lobby:challenge:decline': (data: { challengeId: string }) => void;
}
