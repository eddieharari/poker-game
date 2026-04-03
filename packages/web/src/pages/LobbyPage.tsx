import { useEffect, useRef, useState } from 'react';
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
  .room-row { transition: background 0.12s ease, border-color 0.12s ease; }
  .room-row:hover { background: rgba(255,255,255,0.04) !important; }
`;

// ─── Colours ───────────────────────────────────────────────────────────────────
function roomColors(status: LobbyRoomView['status'], isMyRoom: boolean) {
  if (status === 'playing')
    return { border: '#FF3366', glow: 'rgba(255,51,102,0.2)', dot: '#FF3366', label: 'In Game',  badge: 'rgba(255,51,102,0.15)',  badgeText: '#FF3366' };
  if (status === 'waiting')
    return isMyRoom
      ? { border: '#45F3FF', glow: 'rgba(69,243,255,0.2)',  dot: '#45F3FF', label: 'Waiting',   badge: 'rgba(69,243,255,0.15)',   badgeText: '#45F3FF' }
      : { border: '#00FF9D', glow: 'rgba(0,255,157,0.2)',   dot: '#00FF9D', label: 'Waiting',   badge: 'rgba(0,255,157,0.15)',    badgeText: '#00FF9D' };
  return { border: 'rgba(255,255,255,0.1)', glow: 'transparent', dot: '#444', label: 'Open', badge: 'rgba(255,255,255,0.06)', badgeText: 'rgba(255,255,255,0.4)' };
}

// ─── Room Detail Modal ─────────────────────────────────────────────────────────
interface RoomDetailModalProps {
  room: LobbyRoomView;
  isMyRoom: boolean;
  myChips: number;
  onJoin: (password?: string) => void;
  onLeave: () => void;
  onClose: () => void;
}

function RoomDetailModal({ room, isMyRoom, myChips, onJoin, onLeave, onClose }: RoomDetailModalProps) {
  const [password, setPassword] = useState('');
  const colors   = roomColors(room.status, isMyRoom);
  const isPlaying = room.status === 'playing';
  const required  = room.completeWinBonus ? room.stake * 2 : room.stake;
  const canJoin   = myChips >= required && !isPlaying;
  const needsPw   = room.isPrivate && !isMyRoom && !isPlaying;

  function handleSitIn() {
    if (needsPw && !password) return;
    onJoin(needsPw ? password : undefined);
  }

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="glass-panel rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4"
        style={{ border: `1px solid ${colors.border}`, boxShadow: `0 0 40px ${colors.glow}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colors.dot, boxShadow: `0 0 8px ${colors.dot}` }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.dot }}>{colors.label}</span>
            {room.isPrivate  && <span className="text-[#FFD700] text-sm">🔒</span>}
            {room.isRecurring && <span className="text-gray-500 text-xs">↺</span>}
          </div>
          <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>

        <div>
          <h2 className="lby-h text-xl font-bold text-white">{room.name}</h2>
        </div>

        {/* Details table */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Game</span>
            <span className="text-white font-medium">{room.gameType === 'poker5o' ? '🃏 Poker5O' : '🎴 PazPaz'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Stake</span>
            <span className="font-semibold" style={{ color: '#00FF9D' }}>💰 {room.stake.toLocaleString()}</span>
          </div>
          {room.completeWinBonus && (
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Bonus</span>
              <span className="text-[#FFD700] font-medium">2× Complete Win</span>
            </div>
          )}
          {room.timerDuration && (
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Move Timer</span>
              <span className="text-white">{room.timerDuration}s</span>
            </div>
          )}
          {room.gameType === 'pazpaz' && (
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Assignment</span>
              <span className="text-white">
                {room.assignmentDuration === 60 ? '1 min' : room.assignmentDuration === 180 ? '3 min' : '5 min'}
              </span>
            </div>
          )}
          {room.vocal && (
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Voice</span>
              <span className="text-white">🎙 Enabled</span>
            </div>
          )}
        </div>

        {/* Waiting player */}
        {room.status === 'waiting' && room.waitingPlayerName && (
          <div className="flex items-center gap-2 py-2 border-t border-white/5">
            {room.waitingPlayerAvatar
              ? <img src={room.waitingPlayerAvatar} className="w-7 h-7 rounded-full border border-[#00FF9D]/40 object-cover" alt="" />
              : <div className="w-7 h-7 rounded-full bg-[#00FF9D]/20 flex items-center justify-center text-[#00FF9D] text-[10px] font-bold">{room.waitingPlayerName[0]}</div>
            }
            <p className="text-sm text-gray-300">
              {isMyRoom ? 'You are waiting for an opponent…' : `${room.waitingPlayerName} is waiting`}
            </p>
          </div>
        )}

        {/* Required chips warning */}
        {!canJoin && !isPlaying && !isMyRoom && (
          <p className="text-[#FF3366] text-xs text-center">You need {required.toLocaleString()} chips to join</p>
        )}

        {/* Password input */}
        {needsPw && (
          <input
            autoFocus
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSitIn()}
            placeholder="Enter room password"
            type="password"
            className="w-full bg-black/30 border border-[#FFD700]/30 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-[#FFD700]/60"
          />
        )}

        {/* Actions */}
        {isMyRoom ? (
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-2xl text-sm font-medium border border-white/10 text-gray-400 hover:border-white/20 transition-all"
            >
              Stay
            </button>
            <button
              onClick={onLeave}
              className="flex-1 py-2.5 rounded-2xl text-sm font-bold border border-[#FF3366]/50 text-[#FF3366] hover:bg-[#FF3366]/10 transition-all"
            >
              Leave Room
            </button>
          </div>
        ) : isPlaying ? (
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl text-sm font-medium border border-white/10 text-gray-400 hover:border-white/20 transition-all"
          >
            Close
          </button>
        ) : (
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-2xl text-sm font-medium border border-white/10 text-gray-400 hover:border-white/20 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSitIn}
              disabled={!canJoin || (needsPw && !password)}
              className="flex-1 py-2.5 rounded-2xl text-sm font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#00FF9D', color: '#000', borderColor: '#00FF9D' }}
            >
              Sit In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Create Room Modal ─────────────────────────────────────────────────────────
interface CreateRoomModalProps {
  onClose: () => void;
  profile: { chips: number };
}

function CreateRoomModal({ onClose, profile }: CreateRoomModalProps) {
  const [name, setName]                           = useState('');
  const [gameType, setGameType]                   = useState<GameType>('poker5o');
  const [stake, setStake]                         = useState<StakeAmount>(STAKE_OPTIONS[2]);
  const [completeWinBonus, setCompleteWinBonus]   = useState(false);
  const [timerDuration, setTimerDuration]         = useState<30 | 45 | 60 | null>(null);
  const [assignmentDuration, setAssignmentDuration] = useState<60 | 180 | 300>(180);
  const [vocal, setVocal]                         = useState(false);
  const [isPrivate, setIsPrivate]                 = useState(false);
  const [password, setPassword]                   = useState('');

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

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={vocal} onChange={e => setVocal(e.target.checked)} className="w-4 h-4 accent-[#6E56CF]" />
          <span className="text-sm text-gray-300">🎙 Voice Chat</span>
        </label>

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

// ─── Filter Dropdown ───────────────────────────────────────────────────────────
type Filter = 'all' | 'low' | 'mid' | 'high' | 'pazpaz' | 'poker5o' | 'free' | 'waiting' | 'ingame';

interface FilterDropdownProps {
  activeFilters: Set<Filter>;
  onApply: (filters: Set<Filter>) => void;
  stakeMidMin: number;
  stakeHighMin: number;
  onClose: () => void;
}

function FilterDropdown({ activeFilters, onApply, stakeMidMin, stakeHighMin, onClose }: FilterDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Set<Filter>>(new Set(activeFilters));

  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [onClose]);

  function toggle(f: Filter) {
    setDraft(prev => {
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

  function handleApply() {
    onApply(draft);
    onClose();
  }

  function handleClear() {
    setDraft(new Set(['all']));
  }

  const groups: { label: string; items: { id: Filter; label: string }[] }[] = [
    {
      label: 'Status',
      items: [
        { id: 'free',    label: '⚫ Free' },
        { id: 'waiting', label: '🟢 Waiting' },
        { id: 'ingame',  label: '🔴 In Game' },
      ],
    },
    {
      label: 'Stake',
      items: [
        { id: 'low',  label: `Low  < ${stakeMidMin}` },
        { id: 'mid',  label: `Mid  ${stakeMidMin}–${stakeHighMin - 1}` },
        { id: 'high', label: `High ${stakeHighMin}+` },
      ],
    },
    {
      label: 'Game',
      items: [
        { id: 'poker5o', label: '🃏 Poker5O' },
        { id: 'pazpaz',  label: '🎴 PazPaz' },
      ],
    },
  ];

  const hasDraft = !draft.has('all');

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 rounded-2xl p-4 w-60 z-50 shadow-2xl space-y-4"
      style={{ background: '#13151E', border: '1px solid rgba(255,255,255,0.14)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-white font-bold uppercase tracking-widest">Filter</span>
        {hasDraft && (
          <button onClick={handleClear} className="text-[10px] text-[#45F3FF] hover:underline">Clear all</button>
        )}
      </div>

      {groups.map(group => (
        <div key={group.label}>
          <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">{group.label}</p>
          <div className="flex flex-col gap-1.5">
            {group.items.map(({ id, label }) => {
              const active = draft.has(id);
              return (
                <button
                  key={id}
                  onClick={() => toggle(id)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left"
                  style={active
                    ? { background: '#45F3FF', color: '#000', border: '1px solid #45F3FF' }
                    : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.08)' }
                  }
                >
                  {label}
                  {active && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <button
        onClick={handleApply}
        className="w-full py-2 rounded-xl text-sm font-bold transition-all"
        style={{ background: '#45F3FF', color: '#000' }}
      >
        Apply
      </button>
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
  const [selectedRoom, setSelectedRoom]       = useState<LobbyRoomView | null>(null);
  const [showFilter, setShowFilter]           = useState(false);

  const [activeFilters, setActiveFilters]     = useState<Set<Filter>>(new Set(['all']));
  const [stakeMidMin, setStakeMidMin]         = useState(101);
  const [stakeHighMin, setStakeHighMin]       = useState(601);


  const filteredRooms = lobbyRooms.filter(room => {
    if (activeFilters.has('all')) return true;

    // Status filters
    const statusFilters = (['free', 'waiting', 'ingame'] as Filter[]).filter(f => activeFilters.has(f));
    if (statusFilters.length > 0) {
      const passStatus = statusFilters.some(f =>
        (f === 'free'    && room.status === 'empty') ||
        (f === 'waiting' && room.status === 'waiting') ||
        (f === 'ingame'  && room.status === 'playing')
      );
      if (!passStatus) return false;
    }

    // Game type filters
    if (activeFilters.has('poker5o') && room.gameType !== 'poker5o') return false;
    if (activeFilters.has('pazpaz')  && room.gameType !== 'pazpaz')  return false;

    // Stake filters
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

  useEffect(() => {
    const socket = getSocket();
    function onGameStarted() { setMyWaitingRoomId(null); setSelectedRoom(null); }
    socket.on('lobbyRoom:game_started', onGameStarted);
    return () => { socket.off('lobbyRoom:game_started', onGameStarted); };
  }, []);

  // Keep selectedRoom in sync when lobbyRooms update
  useEffect(() => {
    if (!selectedRoom) return;
    const updated = lobbyRooms.find(r => r.id === selectedRoom.id);
    if (updated) setSelectedRoom(updated);
    else setSelectedRoom(null);
  }, [lobbyRooms]);

  function joinRoom(room: LobbyRoomView, password?: string) {
    if (room.status === 'playing') return;
    if (myWaitingRoomId === room.id) return;
    getSocket().emit('lobbyRoom:join', { roomId: room.id, password });
    setMyWaitingRoomId(room.id);
    setSelectedRoom(null);
  }

  function leaveRoom() {
    if (!myWaitingRoomId) return;
    getSocket().emit('lobbyRoom:leave', { roomId: myWaitingRoomId });
    setMyWaitingRoomId(null);
    setSelectedRoom(null);
  }

  function deleteRoom(roomId: string) {
    getSocket().emit('lobbyRoom:delete', { roomId });
    if (myWaitingRoomId === roomId) setMyWaitingRoomId(null);
    setSelectedRoom(null);
  }

  const onlinePlayers = players.length + 1;
  const hasActiveFilters = !activeFilters.has('all');

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
          <p className="text-gray-500 text-xs mt-0.5">Click a room to view details and sit in</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter icon button */}
          <div className="relative">
            <button
              onClick={() => setShowFilter(v => !v)}
              title="Filter"
              className="p-2 rounded-xl border transition-all"
              style={{
                borderColor: hasActiveFilters ? '#45F3FF' : 'rgba(255,255,255,0.1)',
                background:  hasActiveFilters ? 'rgba(69,243,255,0.12)' : 'rgba(255,255,255,0.04)',
                color:       hasActiveFilters ? '#45F3FF' : 'rgba(255,255,255,0.5)',
              }}
            >
              {/* Filter icon (SVG) */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
              {hasActiveFilters && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#45F3FF]" />
              )}
            </button>
            {showFilter && (
              <FilterDropdown
                activeFilters={activeFilters}
                onApply={(filters) => setActiveFilters(filters)}
                stakeMidMin={stakeMidMin}
                stakeHighMin={stakeHighMin}
                onClose={() => setShowFilter(false)}
              />
            )}
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-xl text-sm font-bold border transition-all"
            style={{ background: '#45F3FF', color: '#000', borderColor: '#45F3FF' }}
          >
            + Create Room
          </button>
        </div>
      </div>

      {/* ── Rooms List ────────────────────────────────────────────────────── */}
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
          <div className="flex flex-col gap-2">
            {filteredRooms.map(room => {
              const isMyRoom = myWaitingRoomId === room.id;
              const colors   = roomColors(room.status, isMyRoom);
              const isMyOwn  = room.createdBy === profile?.id;

              return (
                <div
                  key={room.id}
                  className="room-row rounded-xl px-4 py-3 border cursor-pointer flex items-center gap-4"
                  style={{
                    borderColor: colors.border,
                    background: 'rgba(26,28,35,0.5)',
                    boxShadow: room.status !== 'empty' ? `0 0 16px ${colors.glow}` : 'none',
                  }}
                  onClick={() => setSelectedRoom(room)}
                >
                  {/* Status dot */}
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: colors.dot, boxShadow: room.status !== 'empty' ? `0 0 6px ${colors.dot}` : 'none' }}
                  />

                  {/* Room name + game type */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="lby-h text-sm font-bold text-white truncate">{room.name}</span>
                      {room.isPrivate   && <span className="text-[#FFD700] text-[11px]">🔒</span>}
                      {room.isRecurring && <span className="text-gray-600 text-[11px]" title="Recurring">↺</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[11px] text-gray-500">{room.gameType === 'poker5o' ? '🃏 Poker5O' : '🎴 PazPaz'}</span>
                      <span className="text-[11px] text-[#00FF9D] font-semibold">💰 {room.stake.toLocaleString()}</span>
                      {room.completeWinBonus && <span className="text-[11px] text-[#FFD700]">2×</span>}
                      {room.timerDuration    && <span className="text-[11px] text-gray-600">⏱{room.timerDuration}s</span>}
                      {room.vocal            && <span className="text-[11px] text-gray-600">🎙</span>}
                    </div>
                  </div>

                  {/* Waiting player avatar */}
                  {room.status === 'waiting' && room.waitingPlayerName && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {room.waitingPlayerAvatar
                        ? <img src={room.waitingPlayerAvatar} className="w-6 h-6 rounded-full border border-[#00FF9D]/40 object-cover" alt="" />
                        : <div className="w-6 h-6 rounded-full bg-[#00FF9D]/20 flex items-center justify-center text-[#00FF9D] text-[9px] font-bold">{room.waitingPlayerName[0]}</div>
                      }
                      <span className="text-[11px] text-gray-400 hidden sm:block max-w-[80px] truncate">
                        {isMyRoom ? 'You' : room.waitingPlayerName}
                      </span>
                    </div>
                  )}

                  {/* Status badge */}
                  <span
                    className="flex-shrink-0 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{ background: colors.badge, color: colors.badgeText }}
                  >
                    {colors.label}
                  </span>

                  {/* Owner delete button */}
                  {isMyOwn && room.createdBy && (
                    <button
                      onClick={e => { e.stopPropagation(); deleteRoom(room.id); }}
                      className="flex-shrink-0 text-gray-600 hover:text-[#FF3366] transition-colors text-sm leading-none"
                      title="Delete room"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Room Detail Modal ──────────────────────────────────────────────── */}
      {selectedRoom && profile && (
        <RoomDetailModal
          room={selectedRoom}
          isMyRoom={myWaitingRoomId === selectedRoom.id}
          myChips={profile.chips}
          onJoin={(pw) => joinRoom(selectedRoom, pw)}
          onLeave={leaveRoom}
          onClose={() => setSelectedRoom(null)}
        />
      )}

      {/* ── Create Room Modal ──────────────────────────────────────────────── */}
      {showCreate && profile && (
        <CreateRoomModal profile={{ chips: profile.chips }} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
