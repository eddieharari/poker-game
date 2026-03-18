import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore.js';
import { useLobbyStore } from '../store/lobbyStore.js';
import { useSocketEvents } from '../hooks/useSocketEvents.js';
import { getSocket } from '../socket.js';
import { STAKE_OPTIONS, type StakeAmount, type OnlinePlayer, type PlayerStatus } from '@poker5o/shared';


export function LobbyPage() {
  const { profile, signOut } = useAuthStore();
  const navigate = useNavigate();
  const { players, incomingChallenge, setIncomingChallenge } = useLobbyStore();
  const [challengeTarget, setChallengeTarget] = useState<OnlinePlayer | null>(null);
  const [selectedStake, setSelectedStake] = useState<StakeAmount>(STAKE_OPTIONS[0]);
  const [completeWinBonus, setCompleteWinBonus] = useState(false);
  const [useTimer, setUseTimer] = useState(false);
  const [myStatus, setMyStatus] = useState<'idle' | 'busy'>('idle');

  function toggleStatus() {
    const next: 'idle' | 'busy' = myStatus === 'idle' ? 'busy' : 'idle';
    setMyStatus(next);
    getSocket().emit('lobby:set_status', { status: next });
  }

  useSocketEvents();

  useEffect(() => {
    const sock = getSocket();
    const enter = () => sock.emit('lobby:enter');
    sock.on('connect', enter);
    if (sock.connected) enter();
    return () => {
      sock.off('connect', enter);
      if (sock.connected) sock.emit('lobby:leave');
    };
  }, []);

  function sendChallenge() {
    if (!challengeTarget) return;
    getSocket().emit('lobby:challenge', { toPlayerId: challengeTarget.id, stake: selectedStake, completeWinBonus, useTimer });
    const bonusNote = completeWinBonus ? ' (5-0 bonus active)' : '';
    const timerNote = useTimer ? ' (45s timer)' : '';
    toast(`Challenge sent to ${challengeTarget.nickname} for ${selectedStake} chips${bonusNote}${timerNote}!`, { icon: '🃏' });
    setChallengeTarget(null);
    setCompleteWinBonus(false);
    setUseTimer(false);
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
    <div
      className="min-h-screen"
      style={{
        backgroundImage: 'url(/bg-lobby.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Header */}
      <header className="bg-black/60 backdrop-blur-sm border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <h1 className="font-display text-2xl text-gold">Poker5O</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="relative">
              <img src={profile?.avatar_url} alt="me" className="w-8 h-8 rounded-full border border-gold/50" />
              <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-black ${myStatus === 'busy' ? 'bg-red-500' : 'bg-green-500'}`} />
            </div>
            <div>
              <p className="text-sm font-semibold">{profile?.nickname}</p>
              <p className="text-xs text-gold">{profile?.chips.toLocaleString()} chips</p>
            </div>
          </div>
          <button
            onClick={toggleStatus}
            className={`text-xs font-semibold px-3 py-1 rounded-full border transition-all ${
              myStatus === 'busy'
                ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30'
                : 'bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30'
            }`}
          >
            {myStatus === 'busy' ? '🔴 Busy' : '🟢 Ready'}
          </button>
          {(profile?.role === 'admin' || profile?.role === 'agent') && (
            <button
              onClick={() => navigate(profile.role === 'admin' ? '/admin' : '/agent')}
              className="text-white/50 hover:text-gold transition-colors p-1.5 rounded-lg hover:bg-white/10"
              aria-label={profile.role === 'admin' ? 'Admin Panel' : 'Agent Panel'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => navigate('/cashier')}
            className="text-white/50 hover:text-gold transition-colors p-1.5 rounded-lg hover:bg-white/10"
            aria-label="Cashier"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="text-white/50 hover:text-gold transition-colors p-1.5 rounded-lg hover:bg-white/10"
            aria-label="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button onClick={signOut} className="btn-ghost text-sm px-3 py-1">Sign out</button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-6 bg-black/40 backdrop-blur-sm min-h-[calc(100vh-73px)]">
        {/* Player list */}
        <div>
          <h2 className="text-white/60 text-sm font-semibold uppercase tracking-wider mb-3">
            {players.length === 0
              ? 'No other players online yet'
              : `${players.length} other player${players.length === 1 ? '' : 's'} online`}
          </h2>
          {players.length === 0 ? (
            <div className="text-center text-white/30 py-16">
              <p className="text-4xl mb-3">🃏</p>
              <p>Waiting for others to join…</p>
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
            {/* Complete win bonus */}
            <label className={`flex items-start gap-3 rounded-xl p-3 border cursor-pointer transition-all select-none
              ${completeWinBonus ? 'border-gold/50 bg-gold/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
              <input
                type="checkbox"
                checked={completeWinBonus}
                onChange={e => setCompleteWinBonus(e.target.checked)}
                className="mt-0.5 accent-yellow-400 w-4 h-4 shrink-0"
              />
              <div>
                <p className="text-sm font-semibold text-white/90">Complete Win Bonus (5-0)</p>
                <p className="text-xs text-white/50 mt-0.5">
                  A 5-0 sweep doubles the payout.
                  Both players need <span className="text-gold font-medium">{(selectedStake * 2).toLocaleString()} chips</span>.
                </p>
                {completeWinBonus && (profile?.chips ?? 0) < selectedStake * 2 && (
                  <p className="text-xs text-red-400 mt-1">You don't have enough chips for this option.</p>
                )}
              </div>
            </label>

            {/* Move timer option */}
            <label className={`flex items-start gap-3 rounded-xl p-3 border cursor-pointer transition-all select-none
              ${useTimer ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
              <input
                type="checkbox"
                checked={useTimer}
                onChange={e => setUseTimer(e.target.checked)}
                className="mt-0.5 accent-yellow-400 w-4 h-4 shrink-0"
              />
              <div>
                <p className="text-sm font-semibold text-white/90">⏱ 45-second move timer</p>
                <p className="text-xs text-white/50 mt-0.5">
                  Each player must act within 45 seconds or a card is auto-placed.
                </p>
              </div>
            </label>

            <div className="flex gap-3">
              <button onClick={() => { setChallengeTarget(null); setCompleteWinBonus(false); setUseTimer(false); }} className="btn-ghost flex-1">Cancel</button>
              <button
                onClick={sendChallenge}
                disabled={completeWinBonus && (profile?.chips ?? 0) < selectedStake * 2}
                className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Send Challenge
              </button>
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
            {incomingChallenge.completeWinBonus && (
              <div className="flex items-center justify-center gap-2 bg-gold/10 border border-gold/30 rounded-xl px-4 py-2">
                <span className="text-lg">🏆</span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gold">Complete Win Bonus Active</p>
                  <p className="text-xs text-white/50">A 5-0 sweep pays <span className="text-gold font-medium">{(incomingChallenge.stake * 2).toLocaleString()}</span> chips</p>
                </div>
              </div>
            )}
            {incomingChallenge.useTimer && (
              <div className="flex items-center justify-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-2">
                <span className="text-lg">⏱</span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-yellow-400">45-Second Move Timer</p>
                  <p className="text-xs text-white/50">Auto-plays if you don't act in time</p>
                </div>
              </div>
            )}
            {(profile?.chips ?? 0) < (incomingChallenge.completeWinBonus ? incomingChallenge.stake * 2 : incomingChallenge.stake) ? (
              <p className="text-red-400 text-sm">You don't have enough chips to accept</p>
            ) : null}
            <div className="flex gap-3">
              <button onClick={declineChallenge} className="btn-danger flex-1">Decline</button>
              <button
                onClick={acceptChallenge}
                disabled={(profile?.chips ?? 0) < (incomingChallenge.completeWinBonus ? incomingChallenge.stake * 2 : incomingChallenge.stake)}
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

const STATUS_DOT: Record<PlayerStatus, string> = {
  idle:     'bg-green-500',
  busy:     'bg-red-500',
  'in-game':'bg-purple-500',
  invited:  'bg-blue-500',
};

const STATUS_BADGE: Partial<Record<PlayerStatus, { bg: string; text: string; label: string }>> = {
  busy:     { bg: 'bg-red-500/20',    text: 'text-red-400',    label: 'Busy' },
  'in-game':{ bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'In Game' },
  invited:  { bg: 'bg-blue-500/20',   text: 'text-blue-400',   label: 'In Queue' },
};

function PlayerRow({ player, myChips, onChallenge }: {
  player: OnlinePlayer;
  myChips: number;
  onChallenge: () => void;
}) {
  const badge = STATUS_BADGE[player.status];
  const totalGames = player.wins + player.losses + player.draws;
  const canChallenge = player.status === 'idle' && myChips >= 10;

  return (
    <div className="flex items-center gap-3 bg-black/20 rounded-xl px-4 py-3 border border-white/5">
      <div className="relative">
        <img src={player.avatarUrl} alt={player.nickname}
          className="w-10 h-10 rounded-full border border-white/20 object-cover" />
        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-felt-dark ${STATUS_DOT[player.status]}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold truncate">{player.nickname}</p>
          {badge && (
            <span className={`text-xs ${badge.bg} ${badge.text} border border-current/30 rounded px-1.5 py-0.5 shrink-0 opacity-70`}>
              {badge.label}
            </span>
          )}
        </div>
        <p className="text-xs text-white/40">
          {totalGames.toLocaleString()} games&nbsp;&nbsp;
          <span className="text-green-400/70">W:{player.wins}</span>&nbsp;
          <span className="text-red-400/70">L:{player.losses}</span>&nbsp;
          <span className="text-white/30">D:{player.draws}</span>
        </p>
      </div>
      <button
        onClick={onChallenge}
        disabled={!canChallenge}
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
