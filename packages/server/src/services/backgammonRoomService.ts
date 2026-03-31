import { redis } from '../redis.js';
import { config } from '../config.js';
import type { BackgammonRoom } from '@poker5o/shared';

export type { BackgammonRoom };

function key(roomId: string): string {
  return `backgammon:room:${roomId}`;
}

export const backgammonRoomService = {
  async create(room: BackgammonRoom): Promise<void> {
    await redis.set(key(room.roomId), JSON.stringify(room), 'EX', config.roomTtl);
  },

  async get(roomId: string): Promise<BackgammonRoom | null> {
    const raw = await redis.get(key(roomId));
    return raw ? (JSON.parse(raw) as BackgammonRoom) : null;
  },

  async save(room: BackgammonRoom): Promise<void> {
    await redis.set(key(room.roomId), JSON.stringify(room), 'EX', config.roomTtl);
  },

  async delete(roomId: string): Promise<void> {
    await redis.del(key(roomId));
  },

  async findByPlayerId(playerId: string): Promise<BackgammonRoom | null> {
    const keys = await redis.keys('backgammon:room:*');
    for (const k of keys) {
      const raw = await redis.get(k);
      if (!raw) continue;
      const room = JSON.parse(raw) as BackgammonRoom;
      if (room.player0.playerId === playerId || room.player1.playerId === playerId) {
        return room;
      }
    }
    return null;
  },
};
