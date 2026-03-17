import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';

interface GameResult {
  id: string;
  room_id: string;
  player0_id: string;
  player1_id: string;
  player0_name: string;
  player1_name: string;
  stake: number;
  winner_id: string | null;
  is_draw: boolean;
  p0_columns: number;
  p1_columns: number;
  house_fee: number;
  created_at: string;
}

interface ChipRequest {
  id: string;
  player_id: string;
  amount: number;
  note: string | null;
  status: 'pending' | 'approved' | 'declined';
  created_at: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function groupByDate<T extends { created_at: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = formatDate(item.created_at);
    const existing = map.get(key) ?? [];
    existing.push(item);
    map.set(key, existing);
  }
  return map;
}

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  pending:  { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Pending' },
  approved: { bg: 'bg-green-500/20',  text: 'text-green-400',  label: 'Approved' },
  declined: { bg: 'bg-red-500/20',    text: 'text-red-400',    label: 'Declined' },
};

export function CashierPage() {
  const navigate = useNavigate();
  const { session } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'history' | 'requests'>('history');
  const [history, setHistory] = useState<GameResult[]>([]);
  const [requests, setRequests] = useState<ChipRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [requestError, setRequestError] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  const myId = session?.user?.id;

  async function fetchHistory() {
    if (!session) return;
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/cashier/history', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) setHistory(await res.json());
    } finally {
      setLoadingHistory(false);
    }
  }

  async function fetchRequests() {
    if (!session) return;
    setLoadingRequests(true);
    try {
      const res = await fetch('/api/cashier/requests', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) setRequests(await res.json());
    } finally {
      setLoadingRequests(false);
    }
  }

  useEffect(() => {
    fetchHistory();
    fetchRequests();
  }, [session]);

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setRequestError('');
    const amount = parseInt(requestAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      setRequestError('Amount must be a positive number');
      return;
    }
    setRequestSubmitting(true);
    try {
      const res = await fetch('/api/cashier/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ amount, note: requestNote || null }),
      });
      if (res.ok) {
        setRequestAmount('');
        setRequestNote('');
        fetchRequests();
      } else {
        const data = await res.json();
        setRequestError(data.error ?? 'Failed to submit request');
      }
    } finally {
      setRequestSubmitting(false);
    }
  }

  // Compute summary stats
  const totalGames = history.length;
  let totalWon = 0;
  let totalLost = 0;
  for (const game of history) {
    const iWon = game.winner_id === myId;
    const iLost = !game.is_draw && game.winner_id !== null && !iWon;
    if (iWon) totalWon += game.stake;
    if (iLost) totalLost += game.stake;
  }
  const netPosition = totalWon - totalLost;

  const groupedHistory = groupByDate(history);

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundImage: 'url(/bg-poker.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Header */}
      <header className="bg-black/60 backdrop-blur-sm border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate('/lobby')}
          className="text-white/50 hover:text-white transition-colors"
          aria-label="Back to lobby"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="font-display text-2xl text-gold">Cashier</h1>
      </header>

      <div className="max-w-3xl mx-auto p-6 space-y-4">
        {/* Tabs */}
        <div className="flex gap-2">
          {(['history', 'requests'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === tab
                  ? 'bg-gold text-black'
                  : 'bg-black/40 border border-white/20 text-white/70 hover:text-white hover:border-white/40'
              }`}
            >
              {tab === 'history' ? 'Game History' : 'Chip Requests'}
            </button>
          ))}
        </div>

        {/* Game History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-black/60 border border-white/10 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-white">{totalGames}</p>
                <p className="text-xs text-white/40 mt-1">Total Games</p>
              </div>
              <div className="bg-black/60 border border-white/10 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-400">+{totalWon.toLocaleString()}</p>
                <p className="text-xs text-white/40 mt-1">Won</p>
              </div>
              <div className="bg-black/60 border border-white/10 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-red-400">-{totalLost.toLocaleString()}</p>
                <p className="text-xs text-white/40 mt-1">Lost</p>
              </div>
              <div className="bg-black/60 border border-white/10 rounded-xl p-3 text-center">
                <p className={`text-2xl font-bold ${netPosition >= 0 ? 'text-gold' : 'text-red-400'}`}>
                  {netPosition >= 0 ? '+' : ''}{netPosition.toLocaleString()}
                </p>
                <p className="text-xs text-white/40 mt-1">Net Position</p>
              </div>
            </div>

            {loadingHistory ? (
              <div className="text-center py-12 text-white/40">Loading history…</div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 text-white/40">
                <p className="text-4xl mb-3">🃏</p>
                <p>No games played yet</p>
              </div>
            ) : (
              Array.from(groupedHistory.entries()).map(([date, games]) => (
                <div key={date} className="space-y-2">
                  <h3 className="text-xs text-white/40 font-semibold uppercase tracking-wider">{date}</h3>
                  <div className="bg-black/60 border border-white/10 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        {games.map((game, i) => {
                          const iAmPlayer0 = game.player0_id === myId;
                          const opponentName = iAmPlayer0 ? game.player1_name : game.player0_name;
                          const iWon = game.winner_id === myId;
                          const isDraw = game.is_draw;
                          const iLost = !isDraw && game.winner_id !== null && !iWon;

                          let resultLabel = 'Draw';
                          let resultColor = 'text-white/50';
                          let amountStr = '0';
                          let amountColor = 'text-white/50';

                          if (iWon) {
                            resultLabel = 'Win';
                            resultColor = 'text-green-400';
                            amountStr = `+${game.stake.toLocaleString()}`;
                            amountColor = 'text-green-400';
                          } else if (iLost) {
                            resultLabel = 'Loss';
                            resultColor = 'text-red-400';
                            amountStr = `-${game.stake.toLocaleString()}`;
                            amountColor = 'text-red-400';
                          }

                          return (
                            <tr
                              key={game.id}
                              className={`border-b border-white/5 ${i % 2 === 0 ? 'bg-white/5' : ''}`}
                            >
                              <td className="px-4 py-3">
                                <p className="font-medium">vs {opponentName}</p>
                                <p className="text-xs text-white/30">
                                  {new Date(game.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-xs text-white/40">{game.p0_columns}-{game.p1_columns}</span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`text-sm font-semibold ${resultColor}`}>{resultLabel}</span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className={`font-semibold ${amountColor}`}>{amountStr}</span>
                                <span className="text-white/30 text-xs ml-1">chips</span>
                              </td>
                              {game.house_fee > 0 && (
                                <td className="px-4 py-3 text-right text-xs text-white/30">
                                  fee: {game.house_fee}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Chip Requests Tab */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            {/* New Request Form */}
            <div className="bg-black/60 border border-white/10 rounded-2xl p-5 space-y-4">
              <h2 className="font-display text-lg text-gold">Request Chips</h2>
              <form onSubmit={handleSubmitRequest} className="space-y-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1 uppercase tracking-wider">Amount</label>
                  <input
                    type="number"
                    min="1"
                    value={requestAmount}
                    onChange={e => setRequestAmount(e.target.value)}
                    placeholder="e.g. 1000"
                    className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-gold/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1 uppercase tracking-wider">Note (optional)</label>
                  <input
                    type="text"
                    value={requestNote}
                    onChange={e => setRequestNote(e.target.value)}
                    placeholder="Reason for request…"
                    className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-gold/50"
                  />
                </div>
                {requestError && <p className="text-red-400 text-sm">{requestError}</p>}
                <button
                  type="submit"
                  disabled={requestSubmitting}
                  className="w-full py-2 rounded-xl bg-gold text-black font-semibold hover:bg-yellow-400 transition-colors disabled:opacity-50"
                >
                  {requestSubmitting ? 'Submitting…' : 'Submit Request'}
                </button>
              </form>
            </div>

            {/* Request List */}
            {loadingRequests ? (
              <div className="text-center py-8 text-white/40">Loading…</div>
            ) : requests.length === 0 ? (
              <div className="text-center py-8 text-white/40">No requests yet</div>
            ) : (
              <div className="bg-black/60 border border-white/10 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-white/50 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-left">Note</th>
                      <th className="px-4 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((req, i) => {
                      const badge = STATUS_BADGE[req.status] ?? STATUS_BADGE['pending'];
                      return (
                        <tr
                          key={req.id}
                          className={`border-b border-white/5 ${i % 2 === 0 ? 'bg-white/5' : ''}`}
                        >
                          <td className="px-4 py-3 text-white/50 text-xs">
                            {new Date(req.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-gold font-semibold">
                            +{req.amount.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-white/60">{req.note ?? '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text} border-current/30`}>
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
