import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore.js';
import { useLobbyStore } from '../store/lobbyStore.js';
import { useSocketEvents } from '../hooks/useSocketEvents.js';
import { getSocket } from '../socket.js';
import { STAKE_OPTIONS, type StakeAmount, type OnlinePlayer, type PlayerStatus, type GameType } from '@poker5o/shared';

// ─── Dark space theme CSS (shared with PazPaz) ────────────────────────────────

const LOBBY_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
  .lby-h { font-family: 'Space Grotesk', sans-serif !important; }
  .glass-panel {
    background: rgba(26, 28, 35, 0.6);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.05);
    box-shadow: 0 8px 32px 0 rgba(0,0,0,0.37);
  }
  .lby-btn {
    transition: all 0.2s ease;
    background: linear-gradient(180deg, #2A2A40 0%, #1A1C23 100%);
    border: 1px solid rgba(255,255,255,0.1);
    color: #E0E6ED;
    box-shadow: 0 4px 15px rgba(0,0,0,0.4);
  }
  .lby-btn:hover {
    background: linear-gradient(180deg, #33334D 0%, #252538 100%);
    border-color: rgba(69,243,255,0.5);
    box-shadow: 0 0 15px rgba(69,243,255,0.4);
    color: #fff;
  }
  .lby-btn:active { box-shadow: none; }
  .lby-stars {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    z-index: 0; pointer-events: none;
    background-image:
      radial-gradient(1px 1px at 20px 30px, #fff, rgba(0,0,0,0)),
      radial-gradient(1px 1px at 40px 70px, #fff, rgba(0,0,0,0)),
      radial-gradient(1px 1px at 50px 160px, #fff, rgba(0,0,0,0)),
      radial-gradient(2px 2px at 90px 40px, rgba(255,255,255,0.8), rgba(0,0,0,0)),
      radial-gradient(2px 2px at 130px 80px, rgba(255,255,255,0.8), rgba(0,0,0,0)),
      radial-gradient(1px 1px at 160px 120px, #fff, rgba(0,0,0,0));
    background-repeat: repeat;
    background-size: 300px 300px;
    animation: lby-twinkle 8s infinite alternate;
  }
  @keyframes lby-twinkle { 0% { opacity: 0.3; } 100% { opacity: 0.7; } }
  .lby-nebula {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    z-index: 0; pointer-events: none;
    background:
      radial-gradient(circle at 15% 50%, rgba(110,86,207,0.15) 0%, transparent 50%),
      radial-gradient(circle at 85% 30%, rgba(69,243,255,0.1) 0%, transparent 50%);
  }
`;

export function LobbyPage() {
  const { profile, signOut } = useAuthStore();
  const navigate = useNavigate();
  const { players, incomingChallenge, setIncomingChallenge, setPlayers } = useLobbyStore();
  const [challengeTarget, setChallengeTarget] = useState<OnlinePlayer | null>(null);
  const [selectedStake, setSelectedStake] = useState<StakeAmount>(STAKE_OPTIONS[0]);
  const [completeWinBonus, setCompleteWinBonus] = useState(false);
  const [timerDuration, setTimerDuration] = useState<30 | 45 | 60 | null>(null);
  const [assignmentDuration, setAssignmentDuration] = useState<60 | 180 | 300>(180);
  const [selectedGameType, setSelectedGameType] = useState<GameType>('poker5o');
  const [myStatus, setMyStatus] = useState<'idle' | 'busy'>('idle');

  function toggleStatus() {
    const next: 'idle' | 'busy' = myStatus === 'idle' ? 'busy' : 'idle';
    setMyStatus(next);
    getSocket().emit('lobby:set_status', { status: next });
  }

  useSocketEvents();

  useEffect(() => {
    setPlayers([]);
    const sock = getSocket();
    const enter = () => sock.emit('lobby:enter');
    sock.on('connect', enter);
    if (sock.connected) enter();
    return () => {
      sock.off('connect', enter);
      if (sock.connected) sock.emit('lobby:leave');
    };
  }, [setPlayers]);

  function sendChallenge() {
    if (!challengeTarget) return;
    getSocket().emit('lobby:challenge', { toPlayerId: challengeTarget.id, stake: selectedStake, completeWinBonus, timerDuration, gameType: selectedGameType, assignmentDuration });
    const gameTypeNote = selectedGameType === 'pazpaz' ? ' [PAZPAZ]' : '';
    const bonusNote = completeWinBonus && selectedGameType !== 'pazpaz' ? ' (5-0 bonus active)' : '';
    const timerNote = timerDuration && selectedGameType !== 'pazpaz' ? ` (${timerDuration}s timer)` : '';
    toast(`Challenge sent to ${challengeTarget.nickname} for ${selectedStake} chips${gameTypeNote}${bonusNote}${timerNote}!`, { icon: '🃏' });
    setChallengeTarget(null);
    setCompleteWinBonus(false);
    setTimerDuration(null);
    setSelectedGameType('poker5o');
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
    <div className="min-h-screen relative" style={{ background: 'radial-gradient(circle at 50% 50%, #12141D 0%, #0B0C10 100%)', fontFamily: "'Inter', sans-serif", color: '#E0E6ED' }}>
      <style>{LOBBY_STYLES}</style>
      <div className="lby-stars" />
      <div className="lby-nebula" />

      {/* Header */}
      <header className="relative z-10 glass-panel border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#45F3FF] animate-pulse" style={{ boxShadow: '0 0 12px #45F3FF' }} />
          <h1 className="lby-h text-xl tracking-widest text-white uppercase">Poker5O</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 glass-panel px-4 py-2 rounded-full border border-white/10">
            <div className="relative">
              <img src={profile?.avatar_url} alt="me" className="w-8 h-8 rounded-full border-2 border-[#45F3FF] object-cover" />
              <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#0B0C10] ${myStatus === 'busy' ? 'bg-[#FF3366]' : 'bg-[#00FF9D]'}`} />
            </div>
            <div>
              <p className="lby-h text-sm text-white tracking-wide">{profile?.nickname}</p>
              <p className="text-xs text-[#45F3FF] font-medium">{profile?.chips.toLocaleString()} chips</p>
            </div>
          </div>
          <button
            onClick={toggleStatus}
            className={`lby-btn text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
              myStatus === 'busy'
                ? 'border-[#FF3366]/50 text-[#FF3366]'
                : 'border-[#00FF9D]/50 text-[#00FF9D]'
            }`}
          >
            {myStatus === 'busy' ? '● Busy' : '● Ready'}
          </button>
          {(profile?.role === 'admin' || profile?.role === 'agent') && (
            <button
              onClick={() => navigate(profile.role === 'admin' ? '/admin' : '/agent')}
              className="lby-btn w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-white border border-white/10"
              aria-label={profile.role === 'admin' ? 'Admin Panel' : 'Agent Panel'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => navigate('/cashier')}
            className="lby-btn w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-white border border-white/10"
            aria-label="Cashier"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="lby-btn w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-white border border-white/10"
            aria-label="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={signOut}
            className="lby-btn text-sm px-3 py-1.5 rounded-xl border border-white/10 font-medium"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="relative z-10 max-w-2xl mx-auto p-6 space-y-6 min-h-[calc(100vh-73px)]">
        {/* Player list */}
        <div>
          <h2 className="lby-h text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 mb-4">
            {players.length === 0
              ? 'No other players online yet'
              : `${players.length} player${players.length === 1 ? '' : 's'} online`}
          </h2>
          {players.length === 0 ? (
            <div className="glass-panel text-center text-gray-600 py-20 rounded-2xl border border-white/5">
              <p className="text-4xl mb-3">🃏</p>
              <p className="text-sm font-medium tracking-wide">Waiting for others to join…</p>
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
            <h3 className="lby-h text-xl text-[#45F3FF] text-center tracking-wide">
              Challenge {challengeTarget.nickname}
            </h3>
            <div className="flex justify-center">
              <img src={challengeTarget.avatarUrl} alt="" className="w-16 h-16 rounded-full border-2 border-[#45F3FF]/50 object-cover" />
            </div>

            {/* Game type toggle */}
            <div>
              <p className="text-xs text-gray-500 mb-2 text-center uppercase tracking-widest">Game Type</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedGameType('poker5o')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border
                    ${selectedGameType === 'poker5o'
                      ? 'border-[#45F3FF]/60 text-[#45F3FF] bg-[#45F3FF]/10'
                      : 'lby-btn border-white/10 text-gray-400'}`}
                  style={selectedGameType === 'poker5o' ? { boxShadow: '0 0 15px rgba(69,243,255,0.2)' } : {}}
                >
                  Poker5O
                </button>
                <button
                  onClick={() => { setSelectedGameType('pazpaz'); setCompleteWinBonus(false); setTimerDuration(null); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border
                    ${selectedGameType === 'pazpaz'
                      ? 'border-[#45F3FF]/60 text-[#45F3FF] bg-[#45F3FF]/10'
                      : 'lby-btn border-white/10 text-gray-400'}`}
                  style={selectedGameType === 'pazpaz' ? { boxShadow: '0 0 15px rgba(69,243,255,0.2)' } : {}}
                >
                  PAZPAZ
                </button>
              </div>
              {selectedGameType === 'pazpaz' && (
                <>
                  <p className="text-xs text-gray-600 text-center mt-1">
                    3-flop Omaha — assign your 12 cards to 3 flops simultaneously
                  </p>
                  <div className="space-y-2 mt-3">
                    <p className="text-xs text-gray-500 text-center uppercase tracking-widest">⏱ Assignment Time</p>
                    <div className="flex gap-2">
                      {([60, 180, 300] as const).map(val => (
                        <button
                          key={val}
                          onClick={() => setAssignmentDuration(val)}
                          className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all border
                            ${assignmentDuration === val
                              ? 'border-[#FFD700]/60 text-[#FFD700] bg-[#FFD700]/10'
                              : 'lby-btn border-white/10 text-gray-400'}`}
                        >
                          {val === 60 ? '1 min' : val === 180 ? '3 min' : '5 min'}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-2 text-center uppercase tracking-widest">Select stake</p>
              <div className="grid grid-cols-5 gap-2">
                {STAKE_OPTIONS.map(amount => (
                  <button
                    key={amount}
                    onClick={() => setSelectedStake(amount)}
                    disabled={(profile?.chips ?? 0) < amount}
                    className={`py-2 rounded-xl text-sm font-semibold transition-all border
                      ${selectedStake === amount
                        ? 'border-[#45F3FF]/60 text-[#45F3FF] bg-[#45F3FF]/10'
                        : 'lby-btn border-white/10 text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed'
                      }`}
                    style={selectedStake === amount ? { boxShadow: '0 0 10px rgba(69,243,255,0.2)' } : {}}
                  >
                    {amount >= 1000 ? `${amount / 1000}k` : amount}
                  </button>
                ))}
              </div>
            </div>

            {selectedGameType === 'poker5o' && (
              <>
                <label className={`flex items-start gap-3 rounded-xl p-3 border cursor-pointer transition-all select-none
                  ${completeWinBonus ? 'border-[#FFD700]/40 bg-[#FFD700]/5' : 'border-white/5 bg-white/2 hover:border-white/10'}`}>
                  <input
                    type="checkbox"
                    checked={completeWinBonus}
                    onChange={e => setCompleteWinBonus(e.target.checked)}
                    className="mt-0.5 accent-yellow-400 w-4 h-4 shrink-0"
                  />
                  <div>
                    <p className="text-sm font-semibold text-white/90">Complete Win Bonus (5-0)</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      A 5-0 sweep doubles the payout.
                      Both players need <span className="text-[#FFD700] font-medium">{(selectedStake * 2).toLocaleString()} chips</span>.
                    </p>
                    {completeWinBonus && (profile?.chips ?? 0) < selectedStake * 2 && (
                      <p className="text-xs text-[#FF3366] mt-1">You don't have enough chips for this option.</p>
                    )}
                  </div>
                </label>

                <div className="space-y-2">
                  <p className="text-xs text-gray-500 uppercase tracking-widest">⏱ Move Timer</p>
                  <div className="flex gap-2">
                    {([null, 30, 45, 60] as const).map(val => (
                      <button
                        key={String(val)}
                        onClick={() => setTimerDuration(val)}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all border
                          ${timerDuration === val
                            ? 'border-[#FFD700]/60 text-[#FFD700] bg-[#FFD700]/10'
                            : 'lby-btn border-white/10 text-gray-400'}`}
                      >
                        {val === null ? 'Off' : `${val}s`}
                      </button>
                    ))}
                  </div>
                  {timerDuration && (
                    <p className="text-xs text-gray-600">
                      Each player must act within {timerDuration}s or a card is auto-placed.
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setChallengeTarget(null); setCompleteWinBonus(false); setTimerDuration(null); setSelectedGameType('poker5o'); }}
                className="lby-btn flex-1 py-2.5 rounded-xl font-medium border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={sendChallenge}
                disabled={selectedGameType === 'poker5o' && completeWinBonus && (profile?.chips ?? 0) < selectedStake * 2}
                className="flex-1 py-2.5 rounded-xl lby-h text-sm tracking-widest uppercase font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105"
                style={{ background: '#00FF9D', color: '#000', boxShadow: '0 0 25px rgba(0,255,157,0.3)', border: '1px solid #00FF9D' }}
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
            <p className="text-xs text-gray-500 uppercase tracking-widest">Incoming challenge</p>
            <div className="flex justify-center">
              <img src={incomingChallenge.from.avatarUrl} alt="" className="w-16 h-16 rounded-full border-2 border-[#45F3FF]/50 object-cover" />
            </div>
            <h3 className="lby-h text-xl text-[#45F3FF] tracking-wide">{incomingChallenge.from.nickname}</h3>
            {incomingChallenge.gameType === 'pazpaz' && (
              <div className="flex items-center justify-center gap-2 bg-[#45F3FF]/5 border border-[#45F3FF]/20 rounded-xl px-4 py-2">
                <span className="text-lg">🃏</span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-[#45F3FF]">PAZPAZ</p>
                  <p className="text-xs text-gray-500">3-flop Omaha game</p>
                </div>
              </div>
            )}
            <div className="glass-panel rounded-xl py-4 border border-white/5">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Stake</p>
              <p className="lby-h text-3xl text-[#45F3FF]" style={{ textShadow: '0 0 15px rgba(69,243,255,0.4)' }}>
                {incomingChallenge.stake.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">chips</p>
            </div>
            {incomingChallenge.completeWinBonus && (
              <div className="flex items-center justify-center gap-2 bg-[#FFD700]/5 border border-[#FFD700]/20 rounded-xl px-4 py-2">
                <span className="text-lg">🏆</span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-[#FFD700]">Complete Win Bonus Active</p>
                  <p className="text-xs text-gray-500">A 5-0 sweep pays <span className="text-[#FFD700] font-medium">{(incomingChallenge.stake * 2).toLocaleString()}</span> chips</p>
                </div>
              </div>
            )}
            {incomingChallenge.timerDuration && (
              <div className="flex items-center justify-center gap-2 bg-[#FFD700]/5 border border-[#FFD700]/20 rounded-xl px-4 py-2">
                <span className="text-lg">⏱</span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-[#FFD700]">{incomingChallenge.timerDuration}-Second Move Timer</p>
                  <p className="text-xs text-gray-500">Auto-plays if you don't act in time</p>
                </div>
              </div>
            )}
            {incomingChallenge.gameType === 'pazpaz' && incomingChallenge.assignmentDuration && (
              <div className="flex items-center justify-center gap-2 bg-[#FFD700]/5 border border-[#FFD700]/20 rounded-xl px-4 py-2">
                <span className="text-lg">⏱</span>
                <div className="text-left">
                  <p className="text-sm font-semibold text-[#FFD700]">
                    {incomingChallenge.assignmentDuration === 60 ? '1 min' : incomingChallenge.assignmentDuration === 180 ? '3 min' : '5 min'} to assign
                  </p>
                  <p className="text-xs text-gray-500">Assignment timer</p>
                </div>
              </div>
            )}
            {(profile?.chips ?? 0) < (incomingChallenge.completeWinBonus ? incomingChallenge.stake * 2 : incomingChallenge.stake) && (
              <p className="text-[#FF3366] text-sm">You don't have enough chips to accept</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={declineChallenge}
                className="lby-btn flex-1 py-2.5 rounded-xl font-medium border border-[#FF3366]/30 text-[#FF3366] hover:bg-[#FF3366]/10"
              >
                Decline
              </button>
              <button
                onClick={acceptChallenge}
                disabled={(profile?.chips ?? 0) < (incomingChallenge.completeWinBonus ? incomingChallenge.stake * 2 : incomingChallenge.stake)}
                className="flex-1 py-2.5 rounded-xl lby-h text-sm tracking-widest uppercase font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105"
                style={{ background: '#00FF9D', color: '#000', boxShadow: '0 0 25px rgba(0,255,157,0.3)', border: '1px solid #00FF9D' }}
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
  idle:      'bg-[#00FF9D]',
  busy:      'bg-[#FF3366]',
  'in-game': 'bg-[#8B5CF6]',
  invited:   'bg-[#45F3FF]',
};

const STATUS_BADGE: Partial<Record<PlayerStatus, { border: string; text: string; bg: string; label: string }>> = {
  busy:      { border: 'border-[#FF3366]/30', text: 'text-[#FF3366]', bg: 'bg-[#FF3366]/10', label: 'Busy' },
  'in-game': { border: 'border-[#8B5CF6]/30', text: 'text-[#8B5CF6]', bg: 'bg-[#8B5CF6]/10', label: 'In Game' },
  invited:   { border: 'border-[#45F3FF]/30', text: 'text-[#45F3FF]', bg: 'bg-[#45F3FF]/10', label: 'In Queue' },
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
    <div className="glass-panel flex items-center gap-3 rounded-xl px-4 py-3 border border-white/5 hover:border-white/10 transition-all">
      <div className="relative">
        <img src={player.avatarUrl} alt={player.nickname}
          className="w-10 h-10 rounded-full border border-white/10 object-cover" />
        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#0B0C10] ${STATUS_DOT[player.status]}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-white/90 truncate">{player.nickname}</p>
          {badge && (
            <span className={`text-xs ${badge.bg} ${badge.text} ${badge.border} border rounded-md px-1.5 py-0.5 shrink-0`}>
              {badge.label}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-0.5">
          {totalGames.toLocaleString()} games&nbsp;&nbsp;
          <span className="text-[#00FF9D]/70">W:{player.wins}</span>&nbsp;
          <span className="text-[#FF3366]/70">L:{player.losses}</span>&nbsp;
          <span className="text-gray-600">D:{player.draws}</span>
        </p>
      </div>
      <button
        onClick={onChallenge}
        disabled={!canChallenge}
        className="text-sm px-4 py-1.5 rounded-xl font-semibold transition-all border disabled:opacity-30 disabled:cursor-not-allowed"
        style={canChallenge ? {
          border: '1px solid rgba(69,243,255,0.4)',
          color: '#45F3FF',
          background: 'rgba(69,243,255,0.08)',
          boxShadow: '0 0 10px rgba(69,243,255,0.1)',
        } : {
          border: '1px solid rgba(255,255,255,0.05)',
          color: '#555',
        }}
      >
        Challenge
      </button>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass-panel border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-slide-up"
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
