export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  clientOrigins: (process.env.CLIENT_ORIGINS ?? 'http://localhost:5173').split(','),
  // Room TTL: 2 hours in seconds
  roomTtl: 60 * 60 * 2,
  // Challenge TTL: 30 seconds
  challengeTtl: 30,
  // Disconnect grace period before abandoning game: 10 minutes
  disconnectTtl: 60 * 10,
};
