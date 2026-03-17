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

interface ChipRequest {
  id: string;
  amount: number;
  note: string | null;
  created_at: string;
  profiles: { nickname: string; avatar_url: string };
}

interface HouseSettings {
  feePercent: number;
  feeCap: number;
  housePlayerId: string;
}

export function AdminPage() {
  const [password, setPassword] = useState('');
  const [authedPassword, setAuthedPassword] = useState<string | null>(null);
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState<'players' | 'requests' | 'settings' | 'logs'>('players');
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [requests, setRequests] = useState<ChipRequest[]>([]);
  const [houseSettings, setHouseSettings] = useState<HouseSettings | null>(null);
  const [settingsFeePercent, setSettingsFeePercent] = useState('');
  const [settingsFeeCap, setSettingsFeeCap] = useState('');
  const [settingsHousePlayerId, setSettingsHousePlayerId] = useState('');
  const [settingsSaved, setSettingsSaved] = useState('');
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

  async function fetchRequests() {
    if (!authedPassword) return;
    const res = await fetch('/api/admin/requests', {
      headers: { 'x-admin-password': authedPassword },
    });
    if (res.ok) setRequests(await res.json());
  }

  async function fetchSettings() {
    if (!authedPassword) return;
    const res = await fetch('/api/admin/settings', {
      headers: { 'x-admin-password': authedPassword },
    });
    if (res.ok) {
      const data: HouseSettings = await res.json();
      setHouseSettings(data);
      setSettingsFeePercent(String(data.feePercent));
      setSettingsFeeCap(String(data.feeCap));
      setSettingsHousePlayerId(data.housePlayerId);
    }
  }

  async function handleTabChange(tab: 'players' | 'requests' | 'settings' | 'logs') {
    setActiveTab(tab);
    if (tab === 'logs') fetchLogs();
    if (tab === 'players') fetchPlayers();
    if (tab === 'requests') fetchRequests();
    if (tab === 'settings') fetchSettings();
  }

  async function handleAddChips(e: React.FormEvent) {
    e.preventDefault();
    if (!authedPassword || !addChipsPlayerId) return;
    const amount = parseInt(chipAmount, 10);
    if (isNaN(amount)) {
      setChipsMessage('Invalid amount');
      return;
    }
    const targetId = addChipsPlayerId;
    const targetName = players.find(p => p.id === targetId)?.nickname ?? targetId;
    // Close modal immediately
    setAddChipsPlayerId(null);
    setChipAmount('');
    setChipsMessage('');
    const res = await fetch('/api/admin/chips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': authedPassword,
      },
      body: JSON.stringify({ playerId: targetId, amount }),
    });
    if (res.ok) {
      alert(`Added ${amount} chips to ${targetName}`);
      fetchPlayers();
    } else {
      const data = await res.json();
      alert(`Error: ${data.error ?? 'Failed to add chips'}`);
    }
  }

  async function handleApproveRequest(id: string) {
    if (!authedPassword) return;
    const res = await fetch(`/api/admin/requests/${id}/approve`, {
      method: 'POST',
      headers: { 'x-admin-password': authedPassword },
    });
    if (res.ok) fetchRequests();
    else alert('Failed to approve request');
  }

  async function handleDeclineRequest(id: string) {
    if (!authedPassword) return;
    const res = await fetch(`/api/admin/requests/${id}/decline`, {
      method: 'POST',
      headers: { 'x-admin-password': authedPassword },
    });
    if (res.ok) fetchRequests();
    else alert('Failed to decline request');
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!authedPassword) return;
    setSettingsSaved('');
    const feePercent = parseFloat(settingsFeePercent);
    const feeCap = parseFloat(settingsFeeCap);
    if (isNaN(feePercent) || isNaN(feeCap)) {
      setSettingsSaved('Invalid numbers');
      return;
    }
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': authedPassword,
      },
      body: JSON.stringify({ feePercent, feeCap, housePlayerId: settingsHousePlayerId }),
    });
    if (res.ok) {
      setSettingsSaved('Settings saved!');
      fetchSettings();
    } else {
      setSettingsSaved('Failed to save');
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

  const allTabs = ['players', 'requests', 'settings', 'logs'] as const;

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
          {allTabs.map(tab => (
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
            onClick={() => {
              if (activeTab === 'players') fetchPlayers();
              else if (activeTab === 'logs') fetchLogs();
              else if (activeTab === 'requests') fetchRequests();
              else if (activeTab === 'settings') fetchSettings();
            }}
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

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <div className="bg-black/60 border border-white/10 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/50 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-left">Note</th>
                  <th className="px-4 py-3 text-left">Requested</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req, i) => (
                  <tr
                    key={req.id}
                    className={`border-b border-white/5 ${i % 2 === 0 ? 'bg-white/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <img src={req.profiles.avatar_url} alt="" className="w-7 h-7 rounded-full border border-white/20 object-cover" />
                        <span className="font-medium">{req.profiles.nickname}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gold font-semibold">+{req.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-white/60">{req.note ?? '—'}</td>
                    <td className="px-4 py-3 text-white/40 text-xs">{new Date(req.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleApproveRequest(req.id)}
                          className="text-xs px-2 py-1 rounded bg-green-600/20 border border-green-600/40 text-green-400 hover:bg-green-600/30 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleDeclineRequest(req.id)}
                          className="text-xs px-2 py-1 rounded bg-red-600/20 border border-red-600/40 text-red-400 hover:bg-red-600/30 transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-white/30">No pending requests</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="bg-black/60 border border-white/10 rounded-2xl p-6 max-w-md space-y-5">
            <h2 className="font-display text-lg text-gold">House Fee Settings</h2>
            {houseSettings === null ? (
              <p className="text-white/40 text-sm">Loading…</p>
            ) : (
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div>
                  <label className="block text-xs text-white/50 mb-1 uppercase tracking-wider">Fee Percent (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={settingsFeePercent}
                    onChange={e => setSettingsFeePercent(e.target.value)}
                    className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-gold/50"
                  />
                  <p className="text-xs text-white/30 mt-1">Percentage of the pot taken as house fee</p>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1 uppercase tracking-wider">Fee Cap (0 = no cap)</label>
                  <input
                    type="number"
                    min="0"
                    value={settingsFeeCap}
                    onChange={e => setSettingsFeeCap(e.target.value)}
                    className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-gold/50"
                  />
                  <p className="text-xs text-white/30 mt-1">Maximum chips taken per game (0 = unlimited)</p>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1 uppercase tracking-wider">House Player ID</label>
                  <input
                    type="text"
                    value={settingsHousePlayerId}
                    onChange={e => setSettingsHousePlayerId(e.target.value)}
                    placeholder="Supabase player UUID"
                    className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-gold/50"
                  />
                  <p className="text-xs text-white/30 mt-1">Player ID that receives house fees (empty = no fee)</p>
                </div>
                {settingsSaved && (
                  <p className={`text-sm text-center ${settingsSaved.includes('saved') ? 'text-green-400' : 'text-red-400'}`}>
                    {settingsSaved}
                  </p>
                )}
                <button
                  type="submit"
                  className="w-full py-2 rounded-xl bg-gold text-black font-semibold hover:bg-yellow-400 transition-colors"
                >
                  Save Settings
                </button>
              </form>
            )}
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
