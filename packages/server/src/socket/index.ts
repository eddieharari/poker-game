import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { config } from '../config.js';
import { authenticateSocket } from '../middleware/auth.js';
import { registerLobbyHandlers } from './lobby.js';
import { registerGameHandlers } from './game.js';

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`[Socket] connected: ${socket.auth.nickname} (${socket.auth.playerId})`);

    registerLobbyHandlers(io, socket);
    registerGameHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] disconnected: ${socket.auth.nickname} — ${reason}`);
    });
  });

  return io;
}
