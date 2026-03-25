import { create } from 'zustand';
import type { OnlinePlayer, StakeAmount, GameType } from '@poker5o/shared';

interface IncomingChallenge {
  challengeId: string;
  from: OnlinePlayer;
  stake: StakeAmount;
  completeWinBonus: boolean;
  timerDuration: 30 | 45 | 60 | null;
  gameType?: GameType;
  assignmentDuration?: 60 | 180 | 300;
}

interface LobbyState {
  players: OnlinePlayer[];
  incomingChallenge: IncomingChallenge | null;
  setPlayers: (players: OnlinePlayer[]) => void;
  upsertPlayer: (player: OnlinePlayer) => void;
  removePlayer: (playerId: string) => void;
  updatePlayerStatus: (playerId: string, status: OnlinePlayer['status']) => void;
  setIncomingChallenge: (challenge: IncomingChallenge | null) => void;
}

export const useLobbyStore = create<LobbyState>((set) => ({
  players: [],
  incomingChallenge: null,

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

  setIncomingChallenge: (challenge) => set({ incomingChallenge: challenge }),
}));
