import { redis } from '../redis.js';
import { config } from '../config.js';
import type { PazPazGameState } from '@poker5o/shared';

export interface PazPazRoom {
  roomId: string;
  player0: { playerId: string; playerName: string; avatarUrl: string; connected: boolean };
  player1: { playerId: string; playerName: string; avatarUrl: string; connected: boolean };
  gameState: PazPazGameState;
  status: 'active' | 'finished';
  stake: number | null;
  createdAt: number;
}

function key(roomId: string): string {
  return `pazpaz:room:${roomId}`;
}

export const pazpazRoomService = {
  async create(room: PazPazRoom): Promise<void> {
    await redis.set(key(room.roomId), JSON.stringify(room), 'EX', config.roomTtl);
  },

  async get(roomId: string): Promise<PazPazRoom | null> {
    const raw = await redis.get(key(roomId));
    return raw ? (JSON.parse(raw) as PazPazRoom) : null;
  },

  async save(room: PazPazRoom): Promise<void> {
    await redis.set(key(room.roomId), JSON.stringify(room), 'EX', config.roomTtl);
  },

  async delete(roomId: string): Promise<void> {
    await redis.del(key(roomId));
  },

  async findByPlayerId(playerId: string): Promise<PazPazRoom | null> {
    const keys = await redis.keys('pazpaz:room:*');
    for (const k of keys) {
      const raw = await redis.get(k);
      if (!raw) continue;
      const room = JSON.parse(raw) as PazPazRoom;
      if (room.player0.playerId === playerId || room.player1.playerId === playerId) {
        return room;
      }
    }
    return null;
  },
};
