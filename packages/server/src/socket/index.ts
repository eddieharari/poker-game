import { randomUUID } from 'crypto';
import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { config } from '../config.js';
import { authenticateSocket } from '../middleware/auth.js';
import { registerLobbyHandlers } from './lobby.js';
import { registerGameHandlers } from './game.js';
import { registerPazPazHandlers } from './pazpaz.js';
import { registerLobbyRoomHandlers } from './lobbyRooms.js';
import { registerRematchHandlers } from './rematch.js';
import { roomService } from '../services/roomService.js';
import { pazpazRoomService } from '../services/pazpazRoomService.js';
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
    const { playerId, nickname, email } = socket.auth;
    const ip = socket.handshake.headers['x-forwarded-for'] as string ?? socket.handshake.address;

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
        log('USER_LOGIN', { playerId, nickname, email, ip, note: 'takeover' });
        registerLobbyHandlers(io, socket);
        registerGameHandlers(io, socket);
        registerPazPazHandlers(io, socket);
        registerLobbyRoomHandlers(io, socket);
        registerRematchHandlers(io, socket);
        socket.on('webrtc:signal', ({ toPlayerId, signal }: { toPlayerId: string; signal: unknown }) => {
          io.to(`player:${toPlayerId}`).emit('webrtc:signal', { fromPlayerId: playerId, signal });
        });

        // If player has an active Poker5O game, push them back to it
        roomService.findByPlayerId(playerId).then((room) => {
          if (room && room.status === 'active') {
            socket.emit('game:rejoin_required', { roomId: room.roomId });
          }
        });

        // If player has an active PazPaz game, push them back to it
        pazpazRoomService.findByPlayerId(playerId).then((pazpazRoom) => {
          if (pazpazRoom && pazpazRoom.status === 'active') {
            socket.emit('pazpaz:rejoin_required', { roomId: pazpazRoom.roomId });
          }
        });

        socket.on('disconnect', (reason) => {
          log('USER_DISCONNECT', { playerId, nickname, email, ip, reason });
        });
      });

      return;
    }

    socket.join(`player:${playerId}`);
    socket.emit('session:init', { bootId: SERVER_BOOT_ID });
    log('USER_LOGIN', { playerId, nickname, email, ip });
    registerLobbyHandlers(io, socket);
    registerGameHandlers(io, socket);
    registerPazPazHandlers(io, socket);
    registerLobbyRoomHandlers(io, socket);
    registerRematchHandlers(io, socket);
    socket.on('webrtc:signal', ({ toPlayerId, signal }: { toPlayerId: string; signal: unknown }) => {
      io.to(`player:${toPlayerId}`).emit('webrtc:signal', { fromPlayerId: playerId, signal });
    });

    // If player has an active Poker5O game, push them back to it
    roomService.findByPlayerId(playerId).then((room) => {
      if (room && room.status === 'active') {
        socket.emit('game:rejoin_required', { roomId: room.roomId });
      }
    });

    // If player has an active PazPaz game, push them back to it
    pazpazRoomService.findByPlayerId(playerId).then((pazpazRoom) => {
      if (pazpazRoom && pazpazRoom.status === 'active') {
        socket.emit('pazpaz:rejoin_required', { roomId: pazpazRoom.roomId });
      }
    });

    socket.on('disconnect', (reason) => {
      log('USER_DISCONNECT', { playerId, nickname, email, ip, reason });
    });
  });

  return io;
}
