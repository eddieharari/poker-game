import { create } from 'zustand';
import type { OnlinePlayer, LobbyRoomView } from '@poker5o/shared';

interface LobbyState {
  players: OnlinePlayer[];
  lobbyRooms: LobbyRoomView[];
  // actions
  setPlayers:          (players: OnlinePlayer[]) => void;
  upsertPlayer:        (player: OnlinePlayer) => void;
  removePlayer:        (playerId: string) => void;
  updatePlayerStatus:  (playerId: string, status: OnlinePlayer['status']) => void;
  setLobbyRooms:       (rooms: LobbyRoomView[]) => void;
  upsertLobbyRoom:     (room: LobbyRoomView) => void;
  removeLobbyRoom:     (roomId: string) => void;
}

export const useLobbyStore = create<LobbyState>((set) => ({
  players: [],
  lobbyRooms: [],

  setPlayers: (players) => set({ players }),

  upsertPlayer: (player) =>
    set((s) => {
      const exists = s.players.some(p => p.id === player.id);
      return {
        players: exists
          ? s.players.map(p => p.id === player.id ? player : p)
          : [...s.players, player],
      };
    }),

  removePlayer: (playerId) =>
    set((s) => ({ players: s.players.filter(p => p.id !== playerId) })),

  updatePlayerStatus: (playerId, status) =>
    set((s) => ({
      players: s.players.map(p => p.id === playerId ? { ...p, status } : p),
    })),

  setLobbyRooms: (rooms) => set({ lobbyRooms: rooms }),

  upsertLobbyRoom: (room) =>
    set((s) => {
      const exists = s.lobbyRooms.some(r => r.id === room.id);
      const updated = exists
        ? s.lobbyRooms.map(r => r.id === room.id ? room : r)
        : [...s.lobbyRooms, room];
      return { lobbyRooms: updated.sort((a, b) => a.displayOrder - b.displayOrder) };
    }),

  removeLobbyRoom: (roomId) =>
    set((s) => ({ lobbyRooms: s.lobbyRooms.filter(r => r.id !== roomId) })),
}));
