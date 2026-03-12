import { create } from 'zustand';
export const useGameStore = create((set) => ({
    gameState: null,
    score: null,
    playerIndex: null,
    roomId: null,
    opponentDisconnected: false,
    setGameState: (gameState) => set({ gameState }),
    setScore: (score) => set({ score }),
    setRoom: (roomId, playerIndex) => set({ roomId, playerIndex }),
    setOpponentDisconnected: (v) => set({ opponentDisconnected: v }),
    reset: () => set({ gameState: null, score: null, playerIndex: null, roomId: null, opponentDisconnected: false }),
}));
