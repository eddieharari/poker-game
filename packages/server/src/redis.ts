import Redis from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => {
  console.error('[Redis] connection error:', err.message);
});

redis.on('connect', () => {
  console.log('[Redis] connected');
});
