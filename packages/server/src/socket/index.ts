import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { config } from '../config.js';
import { authenticateSocket } from '../middleware/auth.js';
import { registerLobbyHandlers } from './lobby.js';
import { registerGameHandlers } from './game.js';
import { log } from '../logger.js';

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
    const { playerId, nickname } = socket.auth;

    // Check for an existing socket connected with the same playerId
    const existingSocket = [...io.sockets.sockets.values()]
      .find(s => s.id !== socket.id && s.auth?.playerId === playerId);

    if (existingSocket) {
      // Notify the new socket — it must confirm before taking over
      socket.emit('session:duplicate');

      socket.once('session:confirm_takeover', () => {
        // Kick the old session
        existingSocket.emit('session:kicked');
        existingSocket.disconnect(true);

        log('PLAYER_LOGIN', { playerId, nickname, note: 'takeover' });
        registerLobbyHandlers(io, socket);
        registerGameHandlers(io, socket);

        socket.on('disconnect', (reason) => {
          log('PLAYER_LOGOUT', { playerId, nickname, reason });
        });
      });

      return;
    }

    log('PLAYER_LOGIN', { playerId, nickname });
    registerLobbyHandlers(io, socket);
    registerGameHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      log('PLAYER_LOGOUT', { playerId, nickname, reason });
    });
  });

  return io;
}
