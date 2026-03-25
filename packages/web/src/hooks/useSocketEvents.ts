import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getSocket } from '../socket.js';
import { useLobbyStore } from '../store/lobbyStore.js';
import { useGameStore } from '../store/gameStore.js';
import { useAuthStore } from '../store/authStore.js';
import { playDealSound, playShuffleSound } from '../sounds.js';
import type { GameState } from '@poker5o/shared';

function totalCards(state: GameState): number {
  return state.players.reduce(
    (sum, p) => sum + p.columns.reduce((s, col) => s + col.length, 0),
    0,
  );
}

export function useSocketEvents() {
  const navigate = useNavigate();
  const prevCardCount = useRef(0);
  const shufflePlayed = useRef(false);

  // Pull stable action references — Zustand actions never change identity,
  // so these won't cause the effect to re-run on state updates.
  const setPlayers          = useLobbyStore(s => s.setPlayers);
  const upsertPlayer        = useLobbyStore(s => s.upsertPlayer);
  const removePlayer        = useLobbyStore(s => s.removePlayer);
  const updatePlayerStatus  = useLobbyStore(s => s.updatePlayerStatus);
  const setIncomingChallenge= useLobbyStore(s => s.setIncomingChallenge);
  const setGameState        = useGameStore(s => s.setGameState);
  const setScore            = useGameStore(s => s.setScore);
  const setRoom             = useGameStore(s => s.setRoom);
  const setOpponentDisconnected = useGameStore(s => s.setOpponentDisconnected);
  const setOpponentLeft = useGameStore(s => s.setOpponentLeft);
  const setStartingPlayer   = useGameStore(s => s.setStartingPlayer);
  const fetchProfile        = useAuthStore(s => s.fetchProfile);

  useEffect(() => {
    const socket = getSocket();

    // ─── Lobby ──────────────────────────────────────────────────────────────
    socket.on('lobby:players',       setPlayers);
    socket.on('lobby:player:joined', upsertPlayer);
    socket.on('lobby:player:left',   ({ playerId }) => removePlayer(playerId));
    socket.on('lobby:player:status', ({ playerId, status }) => updatePlayerStatus(playerId, status));

    socket.on('lobby:challenge:incoming', ({ challengeId, from, stake, completeWinBonus, useTimer, gameType }) => {
      setIncomingChallenge({ challengeId, from, stake, completeWinBonus, useTimer: useTimer ?? false, gameType });
    });

    socket.on('lobby:challenge:accepted', ({ roomId, gameType }) => {
      setIncomingChallenge(null);
      if (gameType === 'pazpaz') {
        navigate(`/pazpaz/${roomId}`);
      } else {
        navigate(`/game/${roomId}`);
      }
    });

    socket.on('lobby:challenge:declined', () => toast.error('Challenge declined'));
    socket.on('lobby:challenge:expired',  () => toast('Challenge expired', { icon: '⏱' }));

    // ─── Game ────────────────────────────────────────────────────────────────
    socket.on('room:joined', ({ roomId, playerIndex, stake, completeWinBonus }) => setRoom(roomId, playerIndex, stake, completeWinBonus));
    socket.on('game:state',  (state) => {
      setGameState(state);

      // Shuffle once when setup phase begins
      if (state.phase === 'SETUP_PHASE' && !shufflePlayed.current) {
        shufflePlayed.current = true;
        playShuffleSound();
      }

      // Deal sound each time a new card lands on the table
      const count = totalCards(state);
      if (count > prevCardCount.current) {
        playDealSound();
      }
      prevCardCount.current = count;
    });
    socket.on('game:starting', ({ firstPlayerIndex, firstPlayerName }: { firstPlayerIndex: 0 | 1; firstPlayerName: string }) => {
      setStartingPlayer({ index: firstPlayerIndex, name: firstPlayerName });
      setTimeout(() => setStartingPlayer(null), 2000);
    });

    socket.on('game:over', (score) => {
      prevCardCount.current = 0;
      shufflePlayed.current = false;
      setScore(score);
      // Re-fetch profile so chip count updates immediately
      const { session } = useAuthStore.getState();
      fetchProfile(session);
    });

    socket.on('player:disconnected', () => {
      setOpponentDisconnected(true);
      setOpponentLeft(true);
    });

    socket.on('player:reconnected', () => {
      setOpponentDisconnected(false);
      setOpponentLeft(false);
      toast.success('Opponent reconnected!');
    });

    socket.on('game:rejoin_required', ({ roomId }) => {
      if (!window.location.pathname.startsWith('/game/')) {
        navigate(`/game/${roomId}`);
      }
    });

    socket.on('game:forfeited', ({ forfeiterIndex }) => {
      const { playerIndex } = useGameStore.getState();
      const forfeiterIsMe = forfeiterIndex === playerIndex;
      toast(forfeiterIsMe ? 'You forfeited the game.' : 'Opponent forfeited — you win!', {
        icon: forfeiterIsMe ? '🏳️' : '🏆',
        duration: 4000,
      });
      navigate('/lobby');
    });

    socket.on('room:error', ({ message }) => toast.error(message));

    socket.on('profile:chips_updated', ({ chips }) => {
      const { profile, setProfile } = useAuthStore.getState();
      if (profile) {
        setProfile({ ...profile, chips });
        toast(`Your chip balance updated: ${chips.toLocaleString()} chips`, { icon: '💰' });
      }
    });

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
      socket.off('game:starting');
      socket.off('game:over');
      socket.off('player:disconnected');
      socket.off('player:reconnected');
      socket.off('game:forfeited');
      socket.off('game:rejoin_required');
      socket.off('room:error');
      socket.off('profile:chips_updated');
    };
  }, [navigate, setPlayers, upsertPlayer, removePlayer, updatePlayerStatus,
      setIncomingChallenge, setGameState, setScore, setRoom, setOpponentDisconnected, setOpponentLeft, setStartingPlayer, fetchProfile]);
}
