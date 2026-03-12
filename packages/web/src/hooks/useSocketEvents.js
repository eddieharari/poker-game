import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getSocket } from '../socket.js';
import { useLobbyStore } from '../store/lobbyStore.js';
import { useGameStore } from '../store/gameStore.js';
export function useSocketEvents() {
    const navigate = useNavigate();
    const lobby = useLobbyStore();
    const game = useGameStore();
    useEffect(() => {
        const socket = getSocket();
        // ─── Lobby ──────────────────────────────────────────────────────────────
        socket.on('lobby:players', lobby.setPlayers);
        socket.on('lobby:player:joined', lobby.upsertPlayer);
        socket.on('lobby:player:left', ({ playerId }) => lobby.removePlayer(playerId));
        socket.on('lobby:player:status', ({ playerId, status }) => lobby.updatePlayerStatus(playerId, status));
        socket.on('lobby:challenge:incoming', ({ challengeId, from, stake }) => {
            lobby.setIncomingChallenge({ challengeId, from, stake });
        });
        socket.on('lobby:challenge:accepted', ({ roomId }) => {
            lobby.setIncomingChallenge(null);
            navigate(`/game/${roomId}`);
        });
        socket.on('lobby:challenge:declined', () => {
            toast.error('Challenge declined');
        });
        socket.on('lobby:challenge:expired', () => {
            toast('Challenge expired', { icon: '⏱' });
        });
        // ─── Game ────────────────────────────────────────────────────────────────
        socket.on('room:joined', ({ roomId, playerIndex }) => {
            game.setRoom(roomId, playerIndex);
        });
        socket.on('game:state', game.setGameState);
        socket.on('game:over', game.setScore);
        socket.on('player:disconnected', () => {
            game.setOpponentDisconnected(true);
            toast.error('Opponent disconnected — waiting for reconnect…');
        });
        socket.on('player:reconnected', () => {
            game.setOpponentDisconnected(false);
            toast.success('Opponent reconnected!');
        });
        socket.on('room:error', ({ message }) => toast.error(message));
        return () => {
            socket.off('lobby:players');
            socket.off('lobby:player:joined');
            socket.off('lobby:player:left');
            socket.off('lobby:player:status');
            socket.off('lobby:challenge:incoming');
            socket.off('lobby:challenge:accepted');
            socket.off('lobby:challenge:declined');
            socket.off('lobby:challenge:expired');
            socket.off('room:joined');
            socket.off('game:state');
            socket.off('game:over');
            socket.off('player:disconnected');
            socket.off('player:reconnected');
            socket.off('room:error');
        };
    }, [navigate, lobby, game]);
}
