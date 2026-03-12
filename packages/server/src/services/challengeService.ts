import { redis } from '../redis.js';
import { config } from '../config.js';
import type { Challenge } from '../types.js';

function key(challengeId: string): string {
  return `lobby:challenge:${challengeId}`;
}

export const challengeService = {
  async create(challenge: Challenge): Promise<void> {
    await redis.set(key(challenge.challengeId), JSON.stringify(challenge), 'EX', config.challengeTtl);
  },

  async get(challengeId: string): Promise<Challenge | null> {
    const raw = await redis.get(key(challengeId));
    return raw ? (JSON.parse(raw) as Challenge) : null;
  },

  async delete(challengeId: string): Promise<void> {
    await redis.del(key(challengeId));
  },

  async exists(challengeId: string): Promise<boolean> {
    return (await redis.exists(key(challengeId))) === 1;
  },
};
