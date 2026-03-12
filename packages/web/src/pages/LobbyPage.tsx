import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore.js';
import { useLobbyStore } from '../store/lobbyStore.js';
import { useSocketEvents } from '../hooks/useSocketEvents.js';
import { getSocket } from '../socket.js';
import { STAKE_OPTIONS, type StakeAmount, type OnlinePlayer } from '@poker5o/shared';

export function LobbyPage() {
  const { profile, signOut } = useAuthStore();
  const { players, incomingChallenge, setIncomingChallenge } = useLobbyStore();
  const [challengeTarget, setChallengeTarget] = useState<OnlinePlayer | null>(null);
  const [selectedStake, setSelectedStake] = useState<StakeAmount>(STAKE_OPTIONS[0]);

  useSocketEvents();

  useEffect(() => {
    const socket = getSocket();
    socket.emit('lobby:enter');
    return () => { socket.emit('lobby:leave'); };
  }, []);

  function sendChallenge() {
    if (!challengeTarget) return;
    getSocket().emit('lobby:challenge', { toPlayerId: challengeTarget.id, stake: selectedStake });
    toast(`Challenge sent to ${challengeTarget.nickname} for ${selectedStake} chips!`, { icon: '🃏' });
    setChallengeTarget(null);
  }

  function acceptChallenge() {
    if (!incomingChallenge) return;
    getSocket().emit('lobby:challenge:accept', { challengeId: incomingChallenge.challengeId });
    setIncomingChallenge(null);
  }

  function declineChallenge() {
    if (!incomingChallenge) return;
    getSocket().emit('lobby:challenge:decline', { challengeId: incomingChallenge.challengeId });
    setIncomingChallenge(null);
  }

  return (
    <div className="min-h-screen bg-felt-dark">
      {/* Header */}
      <header className="bg-black/30 border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <h1 className="font-display text-2xl text-gold">Poker5O</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <img src={profile?.avatar_url} alt="me" className="w-8 h-8 rounded-full border border-gold/50" />
            <div>
              <p className="text-sm font-semibold">{profile?.nickname}</p>
              <p className="text-xs text-gold">{profile?.chips.toLocaleString()} chips</p>
            </div>
          </div>
          <button onClick={signOut} className="btn-ghost text-sm px-3 py-1">Sign out</button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Player list */}
        <div>
          <h2 className="text-white/60 text-sm font-semibold uppercase tracking-wider mb-3">
            Online Players ({players.length})
          </h2>
          {players.length === 0 ? (
            <div className="text-center text-white/30 py-16">
              <p className="text-4xl mb-3">🃏</p>
              <p>No other players online yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {players.map(player => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  myChips={profile?.chips ?? 0}
                  onChallenge={() => setChallengeTarget(player)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Challenge modal */}
      {challengeTarget && (
        <Modal onClose={() => setChallengeTarget(null)}>
          <div className="space-y-5">
            <h3 className="font-display text-2xl text-gold text-center">
              Challenge {challengeTarget.nickname}
            </h3>
            <div className="flex justify-center">
              <img src={challengeTarget.avatarUrl} alt="" className="w-16 h-16 rounded-full border-2 border-gold/40" />
            </div>
            <div>
              <p className="text-sm text-white/60 mb-2 text-center">Select stake</p>
              <div className="grid grid-cols-5 gap-2">
                {STAKE_OPTIONS.map(amount => (
                  <button
                    key={amount}
                    onClick={() => setSelectedStake(amount)}
                    disabled={(profile?.chips ?? 0) < amount}
                    className={`py-2 rounded-lg text-sm font-semibold transition-all
                      ${selectedStake === amount
                        ? 'bg-gold text-black'
                        : 'bg-black/30 border border-white/20 hover:border-gold/50 disabled:opacity-30 disabled:cursor-not-allowed'
                      }`}
                  >
                    {amount >= 1000 ? `${amount / 1000}k` : amount}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setChallengeTarget(null)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={sendChallenge} className="btn-primary flex-1">Send Challenge</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Incoming challenge */}
      {incomingChallenge && (
        <Modal onClose={declineChallenge}>
          <div className="space-y-5 text-center">
            <p className="text-white/60 text-sm">Incoming challenge!</p>
            <div className="flex justify-center">
              <img src={incomingChallenge.from.avatarUrl} alt="" className="w-16 h-16 rounded-full border-2 border-gold/40" />
            </div>
            <h3 className="font-display text-2xl text-gold">{incomingChallenge.from.nickname}</h3>
            <div className="bg-black/30 rounded-xl py-4">
              <p className="text-white/50 text-sm">Stake</p>
              <p className="text-3xl font-bold text-gold">{incomingChallenge.stake.toLocaleString()}</p>
              <p className="text-white/50 text-sm">chips</p>
            </div>
            {(profile?.chips ?? 0) < incomingChallenge.stake ? (
              <p className="text-red-400 text-sm">You don't have enough chips to accept</p>
            ) : null}
            <div className="flex gap-3">
              <button onClick={declineChallenge} className="btn-danger flex-1">Decline</button>
              <button
                onClick={acceptChallenge}
                disabled={(profile?.chips ?? 0) < incomingChallenge.stake}
                className="btn-primary flex-1"
              >
                Accept
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PlayerRow({ player, myChips, onChallenge }: {
  player: OnlinePlayer;
  myChips: number;
  onChallenge: () => void;
}) {
  const statusColor = {
    idle:     'bg-green-500',
    'in-game':'bg-yellow-500',
    invited:  'bg-blue-500',
  }[player.status];

  const statusLabel = {
    idle:     'Online',
    'in-game':'In Game',
    invited:  'In a challenge',
  }[player.status];

  return (
    <div className="flex items-center gap-3 bg-black/20 rounded-xl px-4 py-3 border border-white/5">
      <div className="relative">
        <img src={player.avatarUrl} alt={player.nickname}
          className="w-10 h-10 rounded-full border border-white/20 object-cover" />
        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-felt-dark ${statusColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{player.nickname}</p>
        <p className="text-xs text-white/40">{statusLabel}</p>
      </div>
      <button
        onClick={onChallenge}
        disabled={player.status !== 'idle' || myChips < 10}
        className="btn-primary text-sm px-3 py-1 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Challenge
      </button>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-felt border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-slide-up"
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
