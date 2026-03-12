import { create } from 'zustand';
export const useLobbyStore = create((set) => ({
    players: [],
    incomingChallenge: null,
    setPlayers: (players) => set({ players }),
    upsertPlayer: (player) => set((s) => {
        const exists = s.players.some(p => p.id === player.id);
        return {
            players: exists
                ? s.players.map(p => p.id === player.id ? player : p)
                : [...s.players, player],
        };
    }),
    removePlayer: (playerId) => set((s) => ({ players: s.players.filter(p => p.id !== playerId) })),
    updatePlayerStatus: (playerId, status) => set((s) => ({
        players: s.players.map(p => p.id === playerId ? { ...p, status } : p),
    })),
    setIncomingChallenge: (challenge) => set({ incomingChallenge: challenge }),
}));
