import { redis } from '../redis.js';
import { config } from '../config.js';
import type { Room, RoomPlayer } from '../types.js';
import type { GameState } from '@poker5o/shared';
import { createInitialState } from '@poker5o/shared';

function key(roomId: string): string {
  return `room:${roomId}`;
}

export const roomService = {
  async create(roomId: string, player0: RoomPlayer): Promise<Room> {
    const room: Room = {
      roomId,
      player0,
      player1: null,
      gameState: null,
      status: 'waiting',
      createdAt: Date.now(),
    };
    await redis.set(key(roomId), JSON.stringify(room), 'EX', config.roomTtl);
    return room;
  },

  async get(roomId: string): Promise<Room | null> {
    const raw = await redis.get(key(roomId));
    return raw ? (JSON.parse(raw) as Room) : null;
  },

  async save(room: Room): Promise<void> {
    await redis.set(key(room.roomId), JSON.stringify(room), 'EX', config.roomTtl);
  },

  async delete(roomId: string): Promise<void> {
    await redis.del(key(roomId));
  },

  async joinAsPlayer1(roomId: string, player1: RoomPlayer): Promise<Room | null> {
    const room = await this.get(roomId);
    if (!room || room.status !== 'waiting' || room.player1 !== null) return null;

    const updated: Room = { ...room, player1, status: 'active' };
    const gameState = createInitialState(
      roomId,
      { id: room.player0.playerId, name: room.player0.playerName },
      { id: player1.playerId, name: player1.playerName },
    );
    updated.gameState = gameState;
    await this.save(updated);
    return updated;
  },

  async updateGameState(roomId: string, gameState: GameState): Promise<void> {
    const room = await this.get(roomId);
    if (!room) return;
    await this.save({ ...room, gameState });
  },

  async setPlayerConnected(roomId: string, playerId: string, connected: boolean): Promise<Room | null> {
    const room = await this.get(roomId);
    if (!room) return null;

    const updated = { ...room };
    if (room.player0.playerId === playerId) {
      updated.player0 = { ...room.player0, connected };
    } else if (room.player1?.playerId === playerId) {
      updated.player1 = { ...room.player1, connected };
    } else {
      return null;
    }

    await this.save(updated);
    return updated;
  },

  async findByPlayerId(playerId: string): Promise<Room | null> {
    // Scan Redis for rooms containing this player — used for reconnection.
    // In production with many rooms you'd maintain a separate index; fine for now.
    const keys = await redis.keys('room:*');
    for (const k of keys) {
      const raw = await redis.get(k);
      if (!raw) continue;
      const room = JSON.parse(raw) as Room;
      if (
        room.player0.playerId === playerId ||
        room.player1?.playerId === playerId
      ) {
        return room;
      }
    }
    return null;
  },
};
