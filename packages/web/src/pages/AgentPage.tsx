import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore.js';

interface AgentPlayer {
  id: string;
  nickname: string;
  avatar_url: string;
  chips: number;
  wins: number;
  losses: number;
  draws: number;
  total_rake: number;
}

interface Dashboard {
  pool: number;
  agentChips: number;
  agentTotalRake: number;
  players: AgentPlayer[];
}

type ActionMode = { type: 'credit' | 'debit'; player: AgentPlayer } | null;

export function AgentPage() {
  const navigate = useNavigate();
  const { session, profile } = useAuthStore();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<ActionMode>(null);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');

  const token = session?.access_token;

  async function fetchDashboard() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/agent/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDashboard(await res.json());
      else {
        const d = await res.json();
        toast.error(d.error ?? 'Failed to load dashboard');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchDashboard(); }, [token]);

  async function handleAction(e: React.FormEvent) {
    e.preventDefault();
    if (!action || !token) return;
    const amt = parseInt(amount, 10);
    if (isNaN(amt) || amt <= 0) { toast.error('Enter a valid positive amount'); return; }
    setSubmitting(true);
    try {
      const endpoint = action.type === 'credit' ? '/api/agent/credit' : '/api/agent/debit';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ playerId: action.player.id, amount: amt }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Failed'); return; }
      toast.success(
        action.type === 'credit'
          ? `Credited ${amt.toLocaleString()} chips to ${action.player.nickname}`
          : `Debited ${amt.toLocaleString()} chips from ${action.player.nickname}`
      );
      setAction(null);
      setAmount('');
      fetchDashboard();
    } finally {
      setSubmitting(false);
    }
  }

  // Build full player list: assigned players + agent themselves
  const allPlayers: (AgentPlayer & { isSelf?: boolean })[] = [];
  if (profile && dashboard) {
    // Add self at top — use agentChips from dashboard so it's fresh after credit/debit
    allPlayers.push({
      id: profile.id,
      nickname: profile.nickname,
      avatar_url: profile.avatar_url,
      chips: dashboard.agentChips,
      wins: profile.wins ?? 0,
      losses: profile.losses ?? 0,
      draws: profile.draws ?? 0,
      total_rake: dashboard.agentTotalRake,
      isSelf: true,
    });
    // Add assigned players (excluding self if they appear)
    for (const p of dashboard.players) {
      if (p.id !== profile.id) allPlayers.push(p);
    }
  }

  const filteredPlayers = allPlayers.filter(p =>
    p.nickname.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundImage: 'url(/bg-poker.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <header className="bg-black/60 backdrop-blur-sm border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate('/lobby')}
          className="text-white/60 hover:text-white transition-colors"
          aria-label="Back to lobby"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="font-display text-xl text-gold">Agent Panel</h1>
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-5">
        {/* Pool balance */}
        {dashboard && (
          <div className="bg-black/60 border border-gold/30 rounded-2xl p-6 flex items-center gap-4 shadow-lg shadow-gold/5">
            <div className="w-12 h-12 rounded-xl bg-gold/20 flex items-center justify-center text-2xl shrink-0">
              🏦
            </div>
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wider">Your Chip Pool</p>
              <p className="text-3xl font-bold text-gold">{dashboard.pool.toLocaleString()}</p>
              <p className="text-xs text-white/40">chips available to distribute</p>
            </div>
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          placeholder="Search players…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-gold/50 text-sm"
        />

        {/* Players table */}
        <div className="bg-black/60 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
              {loading ? 'Loading…' : `${filteredPlayers.length} player${filteredPlayers.length === 1 ? '' : 's'}`}
            </h2>
          </div>
          {loading ? (
            <div className="py-12 text-center text-white/30">Loading…</div>
          ) : allPlayers.length === 0 ? (
            <div className="py-12 text-center text-white/30">
              <p className="text-3xl mb-2">👥</p>
              <p>No players assigned yet — contact admin</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/40 text-xs uppercase tracking-wider border-b border-white/5">
                  <th className="px-5 py-3 text-left">Player</th>
                  <th className="px-5 py-3 text-right">Chips</th>
                  <th className="px-5 py-3 text-right hidden sm:table-cell">W/L/D</th>
                  <th className="px-5 py-3 text-right hidden sm:table-cell">Rake</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((player, i) => (
                  <tr key={player.id} className={`border-b border-white/5 ${i % 2 === 0 ? 'bg-white/[0.03]' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <img src={player.avatar_url} alt="" className="w-8 h-8 rounded-full border border-white/20 object-cover" />
                        <div>
                          <p className="font-medium">{player.nickname}</p>
                          {player.isSelf && (
                            <span className="text-xs text-gold/70">You</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-gold font-semibold">
                      {player.chips.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-white/40 hidden sm:table-cell">
                      <span className="text-green-400">{player.wins}</span>/
                      <span className="text-red-400">{player.losses}</span>/
                      <span>{player.draws}</span>
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-purple-400 hidden sm:table-cell">
                      {(player.total_rake ?? 0).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => { setAction({ type: 'credit', player }); setAmount(''); }}
                          className="text-xs px-2 py-1 rounded bg-green-600/20 border border-green-600/40 text-green-400 hover:bg-green-600/30 transition-colors"
                        >
                          Credit
                        </button>
                        <button
                          onClick={() => { setAction({ type: 'debit', player }); setAmount(''); }}
                          className="text-xs px-2 py-1 rounded bg-red-600/20 border border-red-600/40 text-red-400 hover:bg-red-600/30 transition-colors"
                        >
                          Debit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Credit/Debit modal */}
      {action && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setAction(null)}>
          <div
            className="bg-black/90 border border-white/10 rounded-2xl p-6 w-full max-w-xs shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-display text-lg text-center" style={{ color: action.type === 'credit' ? '#4ade80' : '#f87171' }}>
              {action.type === 'credit' ? '+ Credit Chips' : '− Debit Chips'}
            </h3>
            <p className="text-center text-white/50 text-sm">
              {action.type === 'credit' ? 'Pool → ' : 'Chips → Pool from '}
              <span className="text-white font-medium">{action.player.nickname}</span>
            </p>
            {action.type === 'credit' && dashboard && (
              <p className="text-center text-xs text-white/40">
                Pool balance: <span className="text-gold">{dashboard.pool.toLocaleString()}</span>
              </p>
            )}
            {action.type === 'debit' && (
              <p className="text-center text-xs text-white/40">
                Player chips: <span className="text-gold">{action.player.chips.toLocaleString()}</span>
              </p>
            )}
            <form onSubmit={handleAction} className="space-y-3">
              <input
                type="number"
                min="1"
                autoFocus
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Amount"
                className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-gold/50"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAction(null)}
                  className="flex-1 py-2 rounded-xl border border-white/20 text-white/70 hover:text-white transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
                  style={{
                    background: action.type === 'credit' ? '#16a34a' : '#dc2626',
                    color: 'white',
                  }}
                >
                  {submitting ? '…' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
