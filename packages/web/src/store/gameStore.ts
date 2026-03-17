import { create } from 'zustand';
import type { GameState, GameScore } from '@poker5o/shared';

interface GameStore {
  gameState: GameState | null;
  score: GameScore | null;
  playerIndex: 0 | 1 | null;
  roomId: string | null;
  stake: number | null;
  completeWinBonus: boolean;
  opponentDisconnected: boolean;
  opponentLeft: boolean;

  setGameState: (state: GameState) => void;
  setScore: (score: GameScore) => void;
  setRoom: (roomId: string, playerIndex: 0 | 1, stake: number | null, completeWinBonus: boolean) => void;
  setOpponentDisconnected: (v: boolean) => void;
  setOpponentLeft: (v: boolean) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameState: null,
  score: null,
  playerIndex: null,
  roomId: null,
  stake: null,
  completeWinBonus: false,
  opponentDisconnected: false,
  opponentLeft: false,

  setGameState: (gameState) => set({ gameState }),
  setScore: (score) => set({ score }),
  setRoom: (roomId, playerIndex, stake, completeWinBonus) => set({ roomId, playerIndex, stake, completeWinBonus }),
  setOpponentDisconnected: (v) => set({ opponentDisconnected: v }),
  setOpponentLeft: (v: boolean) => set({ opponentLeft: v }),
  reset: () => set({ gameState: null, score: null, playerIndex: null, roomId: null, stake: null, completeWinBonus: false, opponentDisconnected: false, opponentLeft: false }),
}));
