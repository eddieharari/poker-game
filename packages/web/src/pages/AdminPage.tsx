import { useState } from 'react';

interface PlayerRow {
  id: string;
  nickname: string;
  chips: number;
  wins: number;
  losses: number;
  draws: number;
  avatar_url: string;
}

interface LogEntry {
  ts: string;
  event: string;
  [key: string]: unknown;
}

export function AdminPage() {
  const [password, setPassword] = useState('');
  const [authedPassword, setAuthedPassword] = useState<string | null>(null);
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState<'players' | 'logs'>('players');
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [addChipsPlayerId, setAddChipsPlayerId] = useState<string | null>(null);
  const [chipAmount, setChipAmount] = useState('');
  const [chipsMessage, setChipsMessage] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/admin/players', {
        headers: { 'x-admin-password': password },
      });
      if (res.status === 401) {
        setLoginError('Invalid password');
        return;
      }
      if (!res.ok) {
        setLoginError('Server error');
        return;
      }
      const data = await res.json();
      setPlayers(data);
      setAuthedPassword(password);
    } catch {
      setLoginError('Connection error');
    }
  }

  async function fetchPlayers() {
    if (!authedPassword) return;
    const res = await fetch('/api/admin/players', {
      headers: { 'x-admin-password': authedPassword },
    });
    if (res.ok) setPlayers(await res.json());
  }

  async function fetchLogs() {
    if (!authedPassword) return;
    const res = await fetch('/api/admin/logs', {
      headers: { 'x-admin-password': authedPassword },
    });
    if (res.ok) {
      const data: LogEntry[] = await res.json();
      setLogs([...data].reverse());
    }
  }

  async function handleTabChange(tab: 'players' | 'logs') {
    setActiveTab(tab);
    if (tab === 'logs') fetchLogs();
    if (tab === 'players') fetchPlayers();
  }

  async function handleAddChips(e: React.FormEvent) {
    e.preventDefault();
    if (!authedPassword || !addChipsPlayerId) return;
    const amount = parseInt(chipAmount, 10);
    if (isNaN(amount)) {
      setChipsMessage('Invalid amount');
      return;
    }
    const res = await fetch('/api/admin/chips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': authedPassword,
      },
      body: JSON.stringify({ playerId: addChipsPlayerId, amount }),
    });
    if (res.ok) {
      setChipsMessage(`Added ${amount} chips successfully`);
      setChipAmount('');
      setAddChipsPlayerId(null);
      fetchPlayers();
    } else {
      const data = await res.json();
      setChipsMessage(data.error ?? 'Error');
    }
  }

  if (!authedPassword) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          backgroundImage: 'url(/bg-poker.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="bg-black/80 border border-white/10 rounded-2xl p-8 w-full max-w-sm shadow-2xl space-y-5">
          <div className="text-center space-y-1">
            <h1 className="font-display text-2xl text-gold">Admin Panel</h1>
            <p className="text-white/40 text-sm">Enter your admin password to continue</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Admin password"
              className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-gold/50"
            />
            {loginError && <p className="text-red-400 text-sm text-center">{loginError}</p>}
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gold text-black font-bold hover:bg-yellow-400 transition-colors"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundImage: 'url(/bg-poker.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <header className="bg-black/70 backdrop-blur-sm border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <h1 className="font-display text-2xl text-gold">Admin Panel</h1>
        <button
          onClick={() => setAuthedPassword(null)}
          className="text-white/50 hover:text-white text-sm border border-white/20 hover:border-white/40 px-3 py-1 rounded transition-colors"
        >
          Logout
        </button>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-4">
        {/* Tabs */}
        <div className="flex gap-2">
          {(['players', 'logs'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === tab
                  ? 'bg-gold text-black'
                  : 'bg-black/40 border border-white/20 text-white/70 hover:text-white hover:border-white/40'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
          <button
            onClick={() => activeTab === 'players' ? fetchPlayers() : fetchLogs()}
            className="ml-auto px-3 py-2 rounded-lg text-xs border border-white/20 text-white/50 hover:text-white hover:border-white/40 transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Players Tab */}
        {activeTab === 'players' && (
          <div className="bg-black/60 border border-white/10 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/50 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-right">Chips</th>
                  <th className="px-4 py-3 text-right">W</th>
                  <th className="px-4 py-3 text-right">L</th>
                  <th className="px-4 py-3 text-right">D</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player, i) => (
                  <tr
                    key={player.id}
                    className={`border-b border-white/5 ${i % 2 === 0 ? 'bg-white/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <img src={player.avatar_url} alt="" className="w-7 h-7 rounded-full border border-white/20 object-cover" />
                        <span className="font-medium">{player.nickname}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gold font-semibold">{player.chips.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-green-400">{player.wins}</td>
                    <td className="px-4 py-3 text-right text-red-400">{player.losses}</td>
                    <td className="px-4 py-3 text-right text-white/40">{player.draws}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setAddChipsPlayerId(player.id); setChipsMessage(''); setChipAmount(''); }}
                        className="text-xs px-2 py-1 rounded bg-gold/20 border border-gold/40 text-gold hover:bg-gold/30 transition-colors"
                      >
                        Add Chips
                      </button>
                    </td>
                  </tr>
                ))}
                {players.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-white/30">No players found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div
            className="bg-black/80 border border-white/10 rounded-2xl p-4 overflow-y-auto font-mono text-xs text-green-300/80"
            style={{ maxHeight: '70vh' }}
          >
            {logs.length === 0 ? (
              <p className="text-white/30 text-center py-8">No logs yet</p>
            ) : (
              logs.slice(0, 100).map((entry, i) => (
                <div key={i} className="py-0.5 border-b border-white/5">
                  <span className="text-white/30 mr-2">{new Date(entry.ts).toLocaleTimeString()}</span>
                  <span className="text-yellow-400 mr-2">{entry.event}</span>
                  <span className="text-green-300/60">
                    {Object.entries(entry)
                      .filter(([k]) => k !== 'ts' && k !== 'event')
                      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                      .join(' ')}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Add Chips Modal */}
      {addChipsPlayerId && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setAddChipsPlayerId(null)}>
          <div
            className="bg-black/90 border border-white/10 rounded-2xl p-6 w-full max-w-xs shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-display text-lg text-gold text-center">Add Chips</h3>
            <p className="text-white/50 text-xs text-center">
              Player: <span className="text-white">{players.find(p => p.id === addChipsPlayerId)?.nickname}</span>
            </p>
            <form onSubmit={handleAddChips} className="space-y-3">
              <input
                type="number"
                value={chipAmount}
                onChange={e => setChipAmount(e.target.value)}
                placeholder="Amount (can be negative)"
                className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-gold/50"
              />
              {chipsMessage && <p className="text-sm text-center text-yellow-400">{chipsMessage}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setAddChipsPlayerId(null)} className="flex-1 py-2 rounded-xl border border-white/20 text-white/70 hover:border-white/40 hover:text-white transition-colors text-sm">
                  Cancel
                </button>
                <button type="submit" className="flex-1 py-2 rounded-xl bg-gold text-black font-semibold hover:bg-yellow-400 transition-colors text-sm">
                  Apply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
