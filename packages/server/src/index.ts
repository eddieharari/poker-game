import 'dotenv/config';
import http from 'http';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { redis } from './redis.js';
import { createSocketServer } from './socket/index.js';
import { roomRouter } from './routes/room.js';
import { lobbyRouter } from './routes/lobby.js';
import { profileRouter } from './routes/profile.js';

async function main(): Promise<void> {
  await redis.connect();

  const app = express();

  app.use(cors({ origin: config.clientOrigins, credentials: true }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/room', roomRouter);
  app.use('/lobby', lobbyRouter);
  app.use('/api/profile', profileRouter);

  // Serve React frontend in production
  const webDist = path.resolve(__dirname, '../../../web/dist');
  app.use(express.static(webDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });

  const httpServer = http.createServer(app);
  createSocketServer(httpServer);

  httpServer.listen(config.port, () => {
    console.log(`[Poker5O] server running on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error('[Poker5O] fatal startup error:', err);
  process.exit(1);
});
