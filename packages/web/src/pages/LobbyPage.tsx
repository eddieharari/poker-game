import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useLobbyStore } from '../store/lobbyStore.js';
import { useSocketEvents } from '../hooks/useSocketEvents.js';
import { getSocket } from '../socket.js';
import {
  STAKE_OPTIONS,
  type StakeAmount,
  type GameType,
  type LobbyRoomView,
} from '@poker5o/shared';

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
  .room-card { transition: transform 0.15s ease, box-shadow 0.15s ease; }
  .room-card:hover { transform: translateY(-2px); }
`;

// ─── Room card colours ─────────────────────────────────────────────────────────
function roomColors(status: LobbyRoomView['status'], isMyRoom: boolean) {
  if (status === 'playing')  return { border: '#FF3366', glow: 'rgba(255,51,102,0.25)', bg: 'rgba(255,51,102,0.06)', dot: '#FF3366', label: '🔴 In Game' };
  if (status === 'waiting')  return { border: isMyRoom ? '#45F3FF' : '#00FF9D', glow: isMyRoom ? 'rgba(69,243,255,0.25)' : 'rgba(0,255,157,0.25)', bg: isMyRoom ? 'rgba(69,243,255,0.06)' : 'rgba(0,255,157,0.06)', dot: isMyRoom ? '#45F3FF' : '#00FF9D', label: '🟢 Waiting' };
  return { border: 'rgba(255,255,255,0.12)', glow: 'transparent', bg: 'rgba(255,255,255,0.02)', dot: '#555', label: '⚫ Open' };
}

// ─── Create Room Modal ─────────────────────────────────────────────────────────
interface CreateRoomModalProps {
  onClose: () => void;
  profile: { chips: number };
}

function CreateRoomModal({ onClose, profile }: CreateRoomModalProps) {
  const [name, setName]                       = useState('');
  const [gameType, setGameType]               = useState<GameType>('poker5o');
  const [stake, setStake]                     = useState<StakeAmount>(STAKE_OPTIONS[2]);
  const [completeWinBonus, setCompleteWinBonus] = useState(false);
  const [timerDuration, setTimerDuration]     = useState<30 | 45 | 60 | null>(null);
  const [assignmentDuration, setAssignmentDuration] = useState<60 | 180 | 300>(180);
  const [vocal, setVocal]                     = useState(false);
  const [isPrivate, setIsPrivate]             = useState(false);
  const [password, setPassword]               = useState('');

  const required = completeWinBonus ? stake * 2 : stake;
  const canCreate = profile.chips >= required;

  function handleCreate() {
    if (!canCreate) return;
    getSocket().emit('lobbyRoom:create', {
      name: name.trim() || undefined,
      gameType,
      stake,
      completeWinBonus: gameType === 'poker5o' ? completeWinBonus : false,
      timerDuration: gameType === 'poker5o' ? timerDuration : null,
      assignmentDuration,
      vocal,
      isPrivate,
      password: isPrivate && password ? password : undefined,
    } as any);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass-panel rounded-3xl border border-[#45F3FF]/30 p-6 w-full max-w-md shadow-2xl space-y-5" onClick={e => e.stopPropagation()}>
        <div className="text-center">
          <h2 className="lby-h text-2xl text-[#45F3FF] font-bold">Create Room</h2>
          <p className="text-gray-400 text-sm mt-1">Set up a private room for your friends</p>
        </div>

        {/* Room name */}
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Room Name (optional)</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My Room"
            maxLength={30}
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-[#45F3FF]/50"
          />
        </div>

        {/* Game type */}
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-widest mb-2 block">Game</label>
          <div className="flex gap-2">
            {(['poker5o', 'pazpaz'] as GameType[]).map(g => (
              <button
                key={g}
                onClick={() => setGameType(g)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${gameType === g ? 'bg-[#45F3FF]/15 border-[#45F3FF]/60 text-[#45F3FF]' : 'border-white/10 text-gray-400 hover:border-white/20'}`}
              >
                {g === 'poker5o' ? '🃏 Poker5O' : '🎴 PazPaz'}
              </button>
            ))}
          </div>
        </div>

        {/* Stake */}
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-widest mb-2 block">Stake</label>
          <div className="flex flex-wrap gap-1.5">
            {STAKE_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => setStake(s)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${stake === s ? 'bg-[#00FF9D]/15 border-[#00FF9D]/60 text-[#00FF9D]' : 'border-white/10 text-gray-400 hover:border-white/20'}`}
              >
                {s.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* Game-specific options */}
        {gameType === 'poker5o' && (
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={completeWinBonus} onChange={e => setCompleteWinBonus(e.target.checked)} className="w-4 h-4 accent-[#00FF9D]" />
              <span className="text-sm text-gray-300">Complete Win Bonus <span className="text-gray-500">(2× stake for 5-0 win)</span></span>
            </label>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Move Timer</label>
              <div className="flex gap-1.5">
                {([null, 30, 45, 60] as (null | 30 | 45 | 60)[]).map(t => (
                  <button key={String(t)} onClick={() => setTimerDuration(t)}
                    className={`px-3 py-1 rounded-lg text-xs border transition-all ${timerDuration === t ? 'bg-[#45F3FF]/15 border-[#45F3FF]/60 text-[#45F3FF]' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                    {t === null ? 'Off' : `${t}s`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {gameType === 'pazpaz' && (
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Assignment Time</label>
            <div className="flex gap-1.5">
              {([60, 180, 300] as (60 | 180 | 300)[]).map(d => (
                <button key={d} onClick={() => setAssignmentDuration(d)}
                  className={`px-3 py-1 rounded-lg text-xs border transition-all ${assignmentDuration === d ? 'bg-[#45F3FF]/15 border-[#45F3FF]/60 text-[#45F3FF]' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                  {d === 60 ? '1 min' : d === 180 ? '3 min' : '5 min'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Voice */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={vocal} onChange={e => setVocal(e.target.checked)} className="w-4 h-4 accent-[#6E56CF]" />
          <span className="text-sm text-gray-300">🎙 Voice Chat</span>
        </label>

        {/* Private */}
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} className="w-4 h-4 accent-[#FFD700]" />
            <span className="text-sm text-gray-300">🔒 Password Protected</span>
          </label>
          {isPrivate && (
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              type="password"
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-[#FFD700]/50"
            />
          )}
        </div>

        {!canCreate && (
          <p className="text-[#FF3366] text-xs text-center">You need {required.toLocaleString()} chips to create this room</p>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-2xl border border-white/10 text-gray-400 text-sm font-medium hover:border-white/20 transition-all">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="flex-1 py-2.5 rounded-2xl text-sm font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#45F3FF', color: '#000', borderColor: '#45F3FF' }}
          >
            Create Room
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Password prompt modal ─────────────────────────────────────────────────────
interface PasswordModalProps {
  roomName: string;
  onConfirm: (password: string) => void;
  onClose: () => void;
}

function PasswordModal({ roomName, onConfirm, onClose }: PasswordModalProps) {
  const [password, setPassword] = useState('');
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass-panel rounded-3xl border border-[#FFD700]/30 p-6 w-full max-w-sm shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
        <div className="text-center">
          <p className="text-3xl mb-1">🔒</p>
          <h2 className="lby-h text-xl text-[#FFD700] font-bold">{roomName}</h2>
          <p className="text-gray-400 text-sm mt-1">This room is password protected</p>
        </div>
        <input
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && password && onConfirm(password)}
          placeholder="Enter password"
          type="password"
          className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-[#FFD700]/50"
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-2xl border border-white/10 text-gray-400 text-sm font-medium hover:border-white/20 transition-all">Cancel</button>
          <button
            onClick={() => password && onConfirm(password)}
            disabled={!password}
            className="flex-1 py-2.5 rounded-2xl text-sm font-bold border transition-all disabled:opacity-40"
            style={{ background: '#FFD700', color: '#000', borderColor: '#FFD700' }}
          >
            Enter Room
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main LobbyPage ────────────────────────────────────────────────────────────

export function LobbyPage() {
  const { profile, signOut } = useAuthStore();
  const navigate = useNavigate();
  const { players, lobbyRooms } = useLobbyStore();

  const [myWaitingRoomId, setMyWaitingRoomId] = useState<string | null>(null);
  const [showCreate, setShowCreate]           = useState(false);
  const [passwordPrompt, setPasswordPrompt]   = useState<{ roomId: string; name: string } | null>(null);

  type Filter = 'all' | 'low' | 'mid' | 'high' | 'pazpaz' | 'poker5o';
  const [activeFilters, setActiveFilters] = useState<Set<Filter>>(new Set(['all']));
  const [stakeMidMin, setStakeMidMin]     = useState(101);
  const [stakeHighMin, setStakeHighMin]   = useState(601);

  function toggleFilter(f: Filter) {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (f === 'all') return new Set(['all']);
      next.delete('all');
      if (next.has(f)) {
        next.delete(f);
        if (next.size === 0) next.add('all');
      } else {
        next.add(f);
      }
      return next;
    });
  }

  const filteredRooms = lobbyRooms.filter(room => {
    if (activeFilters.has('all')) return true;
    if (activeFilters.has('poker5o') && room.gameType !== 'poker5o') return false;
    if (activeFilters.has('pazpaz')  && room.gameType !== 'pazpaz')  return false;
    const stakeFilters = (['low', 'mid', 'high'] as Filter[]).filter(f => activeFilters.has(f));
    if (stakeFilters.length > 0) {
      const inLow  = room.stake < stakeMidMin;
      const inMid  = room.stake >= stakeMidMin && room.stake < stakeHighMin;
      const inHigh = room.stake >= stakeHighMin;
      const passStake = stakeFilters.some(f =>
        (f === 'low' && inLow) || (f === 'mid' && inMid) || (f === 'high' && inHigh)
      );
      if (!passStake) return false;
    }
    return true;
  });

  useSocketEvents();

  useEffect(() => {
    const socket = getSocket();
    socket.emit('lobby:enter');
    socket.emit('lobbyRoom:list');
    fetch('/lobby/stake-tiers')
      .then(r => r.json())
      .then(d => { setStakeMidMin(d.stakeMidMin); setStakeHighMin(d.stakeHighMin); })
      .catch(() => {});
    return () => { socket.emit('lobby:leave'); };
  }, []);

  // Sync my waiting room state from socket events
  useEffect(() => {
    const socket = getSocket();

    function onGameStarted() {
      setMyWaitingRoomId(null);
    }

    socket.on('lobbyRoom:game_started', onGameStarted);
    return () => { socket.off('lobbyRoom:game_started', onGameStarted); };
  }, []);

  function joinRoom(room: LobbyRoomView, password?: string) {
    if (room.status === 'playing') return;

    if (room.isPrivate && !password) {
      setPasswordPrompt({ roomId: room.id, name: room.name });
      return;
    }

    // If already waiting in this room, do nothing
    if (myWaitingRoomId === room.id) return;

    const socket = getSocket();
    socket.emit('lobbyRoom:join', { roomId: room.id, password });
    setMyWaitingRoomId(room.id);
  }

  function leaveRoom() {
    if (!myWaitingRoomId) return;
    getSocket().emit('lobbyRoom:leave', { roomId: myWaitingRoomId });
    setMyWaitingRoomId(null);
  }

  function deleteRoom(roomId: string) {
    getSocket().emit('lobbyRoom:delete', { roomId });
    if (myWaitingRoomId === roomId) setMyWaitingRoomId(null);
  }

  const onlinePlayers = players.length + 1; // +1 for self

  return (
    <div className="min-h-screen overflow-auto relative" style={{ background: 'radial-gradient(circle at 50% 30%, #12141D 0%, #0B0C10 100%)' }}>
      <style>{LOBBY_STYLES}</style>
      <div className="lby-stars" />
      <div className="lby-nebula" />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 font-medium border border-white/10 px-2 py-0.5 rounded-full">
            {onlinePlayers} online
          </span>
        </div>

        <div className="flex items-center gap-3">
          {profile?.role === 'admin' && (
            <button onClick={() => navigate('/admin')} className="text-xs text-gray-400 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg transition-colors">
              Admin
            </button>
          )}
          <button onClick={() => navigate('/cashier')} className="text-xs text-gray-400 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg transition-colors">
            Cashier
          </button>
          <button onClick={() => navigate('/settings')} className="text-xs text-gray-400 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg transition-colors">
            Settings
          </button>

          {/* Profile chip */}
          <div className="flex items-center gap-2 glass-panel px-3 py-1.5 rounded-full border border-white/10">
            {profile?.avatar_url
              ? <img src={profile.avatar_url} className="w-7 h-7 rounded-full border border-[#45F3FF]/40 object-cover" alt="" />
              : <div className="w-7 h-7 rounded-full bg-[#45F3FF]/20 flex items-center justify-center text-[#45F3FF] text-xs font-bold">{profile?.nickname?.[0]}</div>
            }
            <div>
              <p className="text-xs font-semibold text-white">{profile?.nickname}</p>
              <p className="text-[10px] text-[#45F3FF]">💰 {profile?.chips?.toLocaleString()}</p>
            </div>
          </div>

          <button onClick={signOut} className="text-xs text-gray-500 hover:text-white transition-colors px-2">Sign out</button>
        </div>
      </header>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <div>
          <h1 className="lby-h text-xl font-bold text-white">Game Rooms</h1>
          <p className="text-gray-500 text-xs mt-0.5">Enter a room to play · Gray = open · Green = waiting · Red = in game</p>
        </div>
        <div className="flex items-center gap-2">
          {myWaitingRoomId && (
            <button
              onClick={leaveRoom}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-[#FF3366]/50 text-[#FF3366] hover:bg-[#FF3366]/10 transition-all"
            >
              ← Leave Room
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-xl text-sm font-bold border transition-all"
            style={{ background: '#45F3FF', color: '#000', borderColor: '#45F3FF' }}
          >
            + Create Room
          </button>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-6 pb-3 flex flex-wrap gap-2">
        {([
          { id: 'all',     label: 'All Rooms' },
          { id: 'low',     label: `🟢 Low <${stakeMidMin}` },
          { id: 'mid',     label: `🟡 Mid ${stakeMidMin}–${stakeHighMin - 1}` },
          { id: 'high',    label: `🔴 High ${stakeHighMin}+` },
          { id: 'pazpaz',  label: '🎴 PazPaz' },
          { id: 'poker5o', label: '🃏 Poker5O' },
        ] as { id: Filter; label: string }[]).map(({ id, label }) => {
          const active = activeFilters.has(id);
          return (
            <button
              key={id}
              onClick={() => toggleFilter(id)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
              style={{
                background: active ? 'rgba(69,243,255,0.15)' : 'rgba(255,255,255,0.04)',
                borderColor: active ? '#45F3FF' : 'rgba(255,255,255,0.1)',
                color: active ? '#45F3FF' : 'rgba(255,255,255,0.45)',
                boxShadow: active ? '0 0 10px rgba(69,243,255,0.2)' : 'none',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Rooms Grid ────────────────────────────────────────────────────── */}
      <main className="relative z-10 px-6 pb-10">
        {filteredRooms.length === 0 && lobbyRooms.length > 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-3xl mb-3">🔍</p>
            <p className="lby-h text-lg text-gray-400 font-semibold">No rooms match your filters</p>
            <button onClick={() => setActiveFilters(new Set(['all']))} className="mt-4 text-xs text-[#45F3FF] underline">Clear filters</button>
          </div>
        ) : lobbyRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-5xl mb-4">🎲</p>
            <p className="lby-h text-xl text-gray-400 font-semibold">No rooms yet</p>
            <p className="text-gray-600 text-sm mt-2">An admin can create rooms, or you can create a private room</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-6 px-6 py-3 rounded-2xl text-sm font-bold border"
              style={{ background: '#45F3FF', color: '#000', borderColor: '#45F3FF' }}
            >
              + Create Room
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredRooms.map(room => {
              const isMyRoom  = myWaitingRoomId === room.id;
              const colors    = roomColors(room.status, isMyRoom);
              const isLocked  = room.status === 'playing';
              const isMyOwn   = room.createdBy === profile?.id;

              return (
                <div
                  key={room.id}
                  className={`room-card glass-panel rounded-2xl p-4 border-2 flex flex-col gap-3 ${isLocked ? 'opacity-70' : 'cursor-pointer'}`}
                  style={{
                    borderColor: colors.border,
                    boxShadow: `0 0 20px ${colors.glow}`,
                    background: colors.bg,
                  }}
                  onClick={() => !isLocked && !isMyRoom && joinRoom(room)}
                >
                  {/* Status dot + label */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colors.dot, boxShadow: `0 0 6px ${colors.dot}` }} />
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{colors.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {room.isPrivate && <span className="text-[10px] text-[#FFD700]">🔒</span>}
                      {room.isRecurring && <span title="Recurring" className="text-[10px] text-gray-500">↺</span>}
                      {isMyOwn && room.createdBy && (
                        <button
                          onClick={e => { e.stopPropagation(); deleteRoom(room.id); }}
                          className="text-[10px] text-gray-600 hover:text-[#FF3366] transition-colors ml-1"
                          title="Delete room"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Room name */}
                  <div>
                    <p className="lby-h text-base font-bold text-white leading-tight truncate">{room.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {room.gameType === 'poker5o' ? '🃏 Poker5O' : '🎴 PazPaz'}
                      {room.vocal && ' · 🎙 Voice'}
                    </p>
                  </div>

                  {/* Stake + rules */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#00FF9D]/40 text-[#00FF9D]">
                      💰 {room.stake.toLocaleString()}
                    </span>
                    {room.completeWinBonus && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#FFD700]/40 text-[#FFD700]">2× bonus</span>
                    )}
                    {room.timerDuration && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-white/20 text-gray-400">⏱ {room.timerDuration}s</span>
                    )}
                    {room.gameType === 'pazpaz' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-white/20 text-gray-400">
                        {room.assignmentDuration === 60 ? '1 min' : room.assignmentDuration === 180 ? '3 min' : '5 min'}
                      </span>
                    )}
                  </div>

                  {/* Waiting player info */}
                  {room.status === 'waiting' && room.waitingPlayerName && (
                    <div className="flex items-center gap-2 mt-auto pt-2 border-t border-white/5">
                      {room.waitingPlayerAvatar
                        ? <img src={room.waitingPlayerAvatar} className="w-6 h-6 rounded-full object-cover border border-[#00FF9D]/40" alt="" />
                        : <div className="w-6 h-6 rounded-full bg-[#00FF9D]/20 flex items-center justify-center text-[#00FF9D] text-[9px] font-bold">{room.waitingPlayerName[0]}</div>
                      }
                      <p className="text-xs text-gray-300 truncate">{isMyRoom ? 'You are waiting…' : `${room.waitingPlayerName} is waiting`}</p>
                    </div>
                  )}

                  {/* Action area */}
                  {!isLocked && (
                    <div className="mt-auto pt-2">
                      {isMyRoom ? (
                        <div className="w-full py-1.5 rounded-xl text-xs font-semibold text-center border border-[#45F3FF]/40 text-[#45F3FF]">
                          Waiting for opponent…
                        </div>
                      ) : room.status === 'waiting' ? (
                        <div
                          className="w-full py-1.5 rounded-xl text-xs font-bold text-center cursor-pointer transition-all hover:opacity-90"
                          style={{ background: '#00FF9D', color: '#000' }}
                        >
                          Join & Play!
                        </div>
                      ) : (
                        <div
                          className="w-full py-1.5 rounded-xl text-xs font-semibold text-center border border-white/10 text-gray-400 group-hover:border-white/20"
                        >
                          Enter Room
                        </div>
                      )}
                    </div>
                  )}

                  {isLocked && (
                    <div className="mt-auto pt-2">
                      <div className="w-full py-1.5 rounded-xl text-xs font-semibold text-center border border-[#FF3366]/30 text-[#FF3366]/70">
                        Game in progress
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Create Room Modal ──────────────────────────────────────────────── */}
      {showCreate && profile && (
        <CreateRoomModal profile={{ chips: profile.chips }} onClose={() => setShowCreate(false)} />
      )}

      {/* ── Password Prompt ────────────────────────────────────────────────── */}
      {passwordPrompt && (
        <PasswordModal
          roomName={passwordPrompt.name}
          onClose={() => setPasswordPrompt(null)}
          onConfirm={(pw) => {
            const room = lobbyRooms.find(r => r.id === passwordPrompt.roomId);
            if (room) joinRoom(room, pw);
            setPasswordPrompt(null);
          }}
        />
      )}
    </div>
  );
}
