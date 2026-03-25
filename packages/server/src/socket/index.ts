import { randomUUID } from 'crypto';
import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { config } from '../config.js';
import { authenticateSocket } from '../middleware/auth.js';
import { registerLobbyHandlers } from './lobby.js';
import { registerGameHandlers } from './game.js';
import { registerPazPazHandlers } from './pazpaz.js';
import { roomService } from '../services/roomService.js';
import { log } from '../logger.js';

// Changes on every server restart — clients detect a new bootId and re-authenticate
const SERVER_BOOT_ID = randomUUID();

let _io: Server | null = null;
export function getIo(): Server | null { return _io; }

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  _io = io;
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

        socket.join(`player:${playerId}`);
        socket.emit('session:init', { bootId: SERVER_BOOT_ID });
        log('PLAYER_LOGIN', { playerId, nickname, note: 'takeover' });
        registerLobbyHandlers(io, socket);
        registerGameHandlers(io, socket);
        registerPazPazHandlers(io, socket);

        socket.on('disconnect', (reason) => {
          log('PLAYER_LOGOUT', { playerId, nickname, reason });
        });
      });

      return;
    }

    socket.join(`player:${playerId}`);
    socket.emit('session:init', { bootId: SERVER_BOOT_ID });
    log('PLAYER_LOGIN', { playerId, nickname });
    registerLobbyHandlers(io, socket);
    registerGameHandlers(io, socket);
    registerPazPazHandlers(io, socket);

    // If player has an active game, push them back to it
    roomService.findByPlayerId(playerId).then((room) => {
      if (room && room.status === 'active') {
        socket.emit('game:rejoin_required', { roomId: room.roomId });
      }
    });

    socket.on('disconnect', (reason) => {
      log('PLAYER_LOGOUT', { playerId, nickname, reason });
    });
  });

  return io;
}
