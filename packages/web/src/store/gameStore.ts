import { create } from 'zustand';
import type { GameState, GameScore } from '@poker5o/shared';

interface GameStore {
  gameState: GameState | null;
  score: GameScore | null;
  playerIndex: 0 | 1 | null;
  roomId: string | null;
  opponentDisconnected: boolean;
  opponentLeft: boolean;

  setGameState: (state: GameState) => void;
  setScore: (score: GameScore) => void;
  setRoom: (roomId: string, playerIndex: 0 | 1) => void;
  setOpponentDisconnected: (v: boolean) => void;
  setOpponentLeft: (v: boolean) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameState: null,
  score: null,
  playerIndex: null,
  roomId: null,
  opponentDisconnected: false,
  opponentLeft: false,

  setGameState: (gameState) => set({ gameState }),
  setScore: (score) => set({ score }),
  setRoom: (roomId, playerIndex) => set({ roomId, playerIndex }),
  setOpponentDisconnected: (v) => set({ opponentDisconnected: v }),
  setOpponentLeft: (v: boolean) => set({ opponentLeft: v }),
  reset: () => set({ gameState: null, score: null, playerIndex: null, roomId: null, opponentDisconnected: false, opponentLeft: false }),
}));
