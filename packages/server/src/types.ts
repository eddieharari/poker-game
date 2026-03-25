import type { GameState, OnlinePlayer, PlayerStatus, StakeAmount, GameType } from '@poker5o/shared';
export type { StakeAmount, GameType };

export type { OnlinePlayer, PlayerStatus };

// ─── Player Identity ──────────────────────────────────────────────────────────

export interface PlayerProfile {
  id: string;         // Supabase user UUID
  nickname: string;
  avatarUrl: string;
}

// ─── Room ─────────────────────────────────────────────────────────────────────

export type RoomStatus = 'waiting' | 'active' | 'finished';

export interface RoomPlayer {
  socketId: string;
  playerId: string;
  playerName: string;
  avatarUrl?: string;
  connected: boolean;
}

export interface Room {
  roomId: string;
  player0: RoomPlayer;
  player1: RoomPlayer | null;
  gameState: GameState | null;
  status: RoomStatus;
  stake: StakeAmount | null;
  completeWinBonus: boolean;
  useTimer: boolean;
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
  stake: StakeAmount;
  completeWinBonus: boolean;
  useTimer: boolean;
  gameType: GameType;
  createdAt: number;
}

// ─── Socket Auth ──────────────────────────────────────────────────────────────

export interface AuthenticatedSocket {
  playerId: string;
  nickname: string;
  avatarUrl: string;
}

// ─── Socket.io Typed Events (server-side extension) ───────────────────────────

