import { redis } from '../redis.js';
import type { OnlinePlayer, PlayerStatus } from '../types.js';

const LOBBY_KEY = 'lobby:online';

export const lobbyService = {
  async addPlayer(player: OnlinePlayer): Promise<void> {
    await redis.hset(LOBBY_KEY, player.id, JSON.stringify(player));
  },

  async removePlayer(playerId: string): Promise<void> {
    await redis.hdel(LOBBY_KEY, playerId);
  },

  async getPlayer(playerId: string): Promise<OnlinePlayer | null> {
    const raw = await redis.hget(LOBBY_KEY, playerId);
    return raw ? (JSON.parse(raw) as OnlinePlayer) : null;
  },

  async getAllPlayers(): Promise<OnlinePlayer[]> {
    const all = await redis.hgetall(LOBBY_KEY);
    return Object.values(all).map(v => JSON.parse(v) as OnlinePlayer);
  },

  async setStatus(playerId: string, status: PlayerStatus): Promise<void> {
    const player = await this.getPlayer(playerId);
    if (!player) return;
    await redis.hset(LOBBY_KEY, playerId, JSON.stringify({ ...player, status }));
  },

  async isOnline(playerId: string): Promise<boolean> {
    return (await redis.hexists(LOBBY_KEY, playerId)) === 1;
  },
};
