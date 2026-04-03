import { useState } from 'react';
import { STAKE_OPTIONS, type StakeAmount, type GameType, type LobbyRoomView, type LobbyRoomTemplate } from '@poker5o/shared';

interface PlayerRow {
  id: string;
  nickname: string;
  chips: number;
  wins: number;
  losses: number;
  draws: number;
  avatar_url: string;
  role: 'admin' | 'agent' | 'user';
  agent_id: string | null;
  total_rake: number;
}

interface AgentRow {
  id: string;
  nickname: string;
  avatar_url: string;
  chips: number;
  agent_chip_pool: number;
  player_count: number;
  rakeback_percent: number;
  total_rake: number;
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
  stakeMidMin: number;
  stakeHighMin: number;
}

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  admin: { label: 'Admin', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
  agent: { label: 'Agent', className: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  user:  { label: 'User',  className: 'bg-white/10 text-white/50 border-white/20' },
};

export function AdminPage() {
  const [password, setPassword] = useState('');
  const [authedPassword, setAuthedPassword] = useState<string | null>(null);
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState<'players' | 'agents' | 'requests' | 'settings' | 'logs' | 'rooms'>('players');
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [requests, setRequests] = useState<ChipRequest[]>([]);
  const [houseSettings, setHouseSettings] = useState<HouseSettings | null>(null);
  const [settingsFeePercent, setSettingsFeePercent] = useState('');
  const [settingsFeeCap, setSettingsFeeCap] = useState('');
  const [settingsHousePlayerId, setSettingsHousePlayerId] = useState('');
  const [settingsMidMin, setSettingsMidMin] = useState('101');
  const [settingsHighMin, setSettingsHighMin] = useState('601');
  const [settingsSaved, setSettingsSaved] = useState('');
  const [addChipsPlayerId, setAddChipsPlayerId] = useState<string | null>(null);
  const [chipAmount, setChipAmount] = useState('');
  const [chipsMessage, setChipsMessage] = useState('');
  const [agentPoolTarget, setAgentPoolTarget] = useState<AgentRow | null>(null);
  const [agentPoolAmount, setAgentPoolAmount] = useState('');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [agentPlayers, setAgentPlayers] = useState<Record<string, any[]>>({});
  const [playerSearch, setPlayerSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [rakebackEdits, setRakebackEdits] = useState<Record<string, string>>({});

  // ─── Rooms tab state ──────────────────────────────────────────────────────────
  const [lobbyRooms, setLobbyRooms]           = useState<LobbyRoomView[]>([]);
  const [lobbyTemplates, setLobbyTemplates]   = useState<LobbyRoomTemplate[]>([]);
  const [roomsSubTab, setRoomsSubTab]         = useState<'rooms' | 'templates'>('rooms');
  const [showRoomForm, setShowRoomForm]       = useState(false);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [roomForm, setRoomForm] = useState({
    name: '', gameType: 'poker5o' as GameType, stake: 100 as StakeAmount,
    completeWinBonus: false, timerDuration: null as null | 30 | 45 | 60,
    assignmentDuration: 180 as 60 | 180 | 300,
    vocal: false, isRecurring: false, isPrivate: false, password: '', displayOrder: 0,
    count: 1, withBot: false,
  });
  const [templateForm, setTemplateForm] = useState({
    name: '', gameType: 'poker5o' as GameType, stake: 100 as StakeAmount,
    completeWinBonus: false, timerDuration: null as null | 30 | 45 | 60,
    assignmentDuration: 180 as 60 | 180 | 300,
    vocal: false, isRecurring: false, isPrivate: false, displayOrder: 0,
  });
  const [roomsMsg, setRoomsMsg] = useState('');

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
      // pre-load agents so assign dropdown is ready on players tab
      const agentRes = await fetch('/api/admin/agents', { headers: { 'x-admin-password': password } });
      if (agentRes.ok) setAgents(await agentRes.json());
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

  async function fetchAgents() {
    if (!authedPassword) return;
    const res = await fetch('/api/admin/agents', { headers: { 'x-admin-password': authedPassword } });
    if (res.ok) setAgents(await res.json());
  }

  async function fetchAgentPlayers(agentId: string) {
    if (!authedPassword) return;
    const res = await fetch(`/api/admin/agents/${agentId}/players`, {
      headers: { 'x-admin-password': authedPassword },
    });
    if (res.ok) {
      const data = await res.json();
      setAgentPlayers(prev => ({ ...prev, [agentId]: data }));
    }
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
      setSettingsMidMin(String(data.stakeMidMin ?? 101));
      setSettingsHighMin(String(data.stakeHighMin ?? 601));
    }
  }

  async function fetchLobbyRooms() {
    const res = await fetch('/api/admin/lobby-rooms', { headers: { 'x-admin-password': authedPassword! } });
    if (res.ok) setLobbyRooms(await res.json());
  }

  async function fetchLobbyTemplates() {
    const res = await fetch('/api/admin/lobby-room-templates', { headers: { 'x-admin-password': authedPassword! } });
    if (res.ok) setLobbyTemplates(await res.json());
  }

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    const { count, withBot, ...rest } = roomForm;
    const n = Math.max(1, Math.min(count, 20));
    let errors = 0;
    for (let i = 1; i <= n; i++) {
      const name = n > 1 ? `${rest.name || 'Table'} #${i}` : rest.name;
      const body = { ...rest, name, password: rest.isPrivate && rest.password ? rest.password : undefined, withBot };
      const res = await fetch('/api/admin/lobby-rooms', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-password': authedPassword! },
        body: JSON.stringify(body),
      });
      if (!res.ok) errors++;
    }
    if (errors === 0) {
      setRoomsMsg(n > 1 ? `${n} rooms created!` : 'Room created!');
      setShowRoomForm(false);
      await fetchLobbyRooms();
    } else { setRoomsMsg(`${errors} room(s) failed to create`); }
    setTimeout(() => setRoomsMsg(''), 3000);
  }

  async function deleteRoom(roomId: string) {
    const res = await fetch(`/api/admin/lobby-rooms/${roomId}`, {
      method: 'DELETE', headers: { 'x-admin-password': authedPassword! },
    });
    if (res.ok) { setLobbyRooms(prev => prev.filter(r => r.id !== roomId)); setRoomsMsg('Room deleted'); }
    else { setRoomsMsg('Error deleting room'); }
    setTimeout(() => setRoomsMsg(''), 3000);
  }

  async function resetRoom(roomId: string) {
    const res = await fetch(`/api/admin/lobby-rooms/${roomId}/reset`, {
      method: 'POST', headers: { 'x-admin-password': authedPassword! },
    });
    if (res.ok) { setRoomsMsg('Room reset'); await fetchLobbyRooms(); }
    setTimeout(() => setRoomsMsg(''), 2000);
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/lobby-room-templates', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-password': authedPassword! },
      body: JSON.stringify(templateForm),
    });
    if (res.ok) {
      setRoomsMsg('Template saved!');
      setShowTemplateForm(false);
      await fetchLobbyTemplates();
    } else { setRoomsMsg('Error saving template'); }
    setTimeout(() => setRoomsMsg(''), 3000);
  }

  async function deleteTemplate(id: string) {
    const res = await fetch(`/api/admin/lobby-room-templates/${id}`, {
      method: 'DELETE', headers: { 'x-admin-password': authedPassword! },
    });
    if (res.ok) { setLobbyTemplates(prev => prev.filter(t => t.id !== id)); }
  }

  async function createRoomFromTemplate(t: LobbyRoomTemplate) {
    const body = { name: t.name, gameType: t.gameType, stake: t.stake, completeWinBonus: t.completeWinBonus, timerDuration: t.timerDuration, assignmentDuration: t.assignmentDuration, vocal: t.vocal, isRecurring: t.isRecurring, isPrivate: t.isPrivate, displayOrder: t.displayOrder };
    const res = await fetch('/api/admin/lobby-rooms', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-password': authedPassword! },
      body: JSON.stringify(body),
    });
    if (res.ok) { setRoomsMsg('Room created from template!'); await fetchLobbyRooms(); setRoomsSubTab('rooms'); }
    setTimeout(() => setRoomsMsg(''), 3000);
  }

  async function handleTabChange(tab: 'players' | 'agents' | 'requests' | 'settings' | 'logs' | 'rooms') {
    setActiveTab(tab);
    if (tab === 'logs') fetchLogs();
    if (tab === 'players') { fetchPlayers(); fetchAgents(); } // agents needed for assign dropdown
    if (tab === 'requests') fetchRequests();
    if (tab === 'settings') fetchSettings();
    if (tab === 'agents') fetchAgents();
    if (tab === 'rooms') { fetchLobbyRooms(); fetchLobbyTemplates(); }
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

  async function handleAgentPool(e: React.FormEvent) {
    e.preventDefault();
    if (!authedPassword || !agentPoolTarget) return;
    const amount = parseInt(agentPoolAmount, 10);
    if (isNaN(amount)) return;
    const target = agentPoolTarget;
    setAgentPoolTarget(null);
    setAgentPoolAmount('');
    const res = await fetch('/api/admin/agent-pool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': authedPassword },
      body: JSON.stringify({ agentId: target.id, amount }),
    });
    if (res.ok) {
      alert(`Pool adjusted by ${amount} for ${target.nickname}`);
      fetchAgents();
    } else {
      const d = await res.json();
      alert(`Error: ${d.error}`);
    }
  }

  async function handleSetRole(playerId: string, role: string) {
    if (!authedPassword) return;
    const res = await fetch('/api/admin/set-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': authedPassword },
      body: JSON.stringify({ playerId, role }),
    });
    if (res.ok) {
      fetchPlayers();
    } else {
      const d = await res.json();
      alert(`Error: ${d.error}`);
    }
  }

  async function handleAssignAgent(playerId: string, agentId: string | null) {
    if (!authedPassword) return;
    const res = await fetch('/api/admin/assign-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': authedPassword },
      body: JSON.stringify({ playerId, agentId }),
    });
    if (res.ok) {
      fetchPlayers();
    } else {
      const d = await res.json();
      alert(`Error: ${d.error}`);
    }
  }

  async function handleSetRakeback(agentId: string, percent: number) {
    if (!authedPassword) return;
    const res = await fetch('/api/admin/set-rakeback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': authedPassword },
      body: JSON.stringify({ agentId, rakebackPercent: percent }),
    });
    if (res.ok) {
      setRakebackEdits(prev => { const n = { ...prev }; delete n[agentId]; return n; });
      fetchAgents();
    } else {
      const d = await res.json();
      alert(`Error: ${d.error}`);
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
    const feePercent  = parseFloat(settingsFeePercent);
    const feeCap      = parseFloat(settingsFeeCap);
    const stakeMidMin  = parseInt(settingsMidMin, 10);
    const stakeHighMin = parseInt(settingsHighMin, 10);
    if (isNaN(feePercent) || isNaN(feeCap) || isNaN(stakeMidMin) || isNaN(stakeHighMin)) {
      setSettingsSaved('Invalid numbers');
      return;
    }
    if (stakeMidMin >= stakeHighMin) {
      setSettingsSaved('Mid minimum must be less than High minimum');
      return;
    }
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': authedPassword,
      },
      body: JSON.stringify({ feePercent, feeCap, housePlayerId: settingsHousePlayerId, stakeMidMin, stakeHighMin }),
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

  const allTabs = ['players', 'agents', 'requests', 'settings', 'logs', 'rooms'] as const;

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
        <div className="flex gap-2 flex-wrap">
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
              else if (activeTab === 'agents') fetchAgents();
              else if (activeTab === 'logs') fetchLogs();
              else if (activeTab === 'requests') fetchRequests();
              else if (activeTab === 'settings') fetchSettings();
              else if (activeTab === 'rooms') { fetchLobbyRooms(); fetchLobbyTemplates(); }
            }}
            className="ml-auto px-3 py-2 rounded-lg text-xs border border-white/20 text-white/50 hover:text-white hover:border-white/40 transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Players Tab */}
        {activeTab === 'players' && (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Search players…"
              value={playerSearch}
              onChange={e => setPlayerSearch(e.target.value)}
              className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-gold/50 text-sm"
            />
          <div className="bg-black/60 border border-white/10 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/50 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-right">Chips</th>
                  <th className="px-4 py-3 text-right">W</th>
                  <th className="px-4 py-3 text-right">L</th>
                  <th className="px-4 py-3 text-right">D</th>
                  <th className="px-4 py-3 text-right">Rake</th>
                  <th className="px-4 py-3 text-center">Role</th>
                  <th className="px-4 py-3 text-center">Agent</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {players.filter(p => p.nickname.toLowerCase().includes(playerSearch.toLowerCase())).map((player, i) => {
                  const badge = ROLE_BADGE[player.role] ?? ROLE_BADGE.user;
                  const assignableAgents = agents.filter(a => a.id !== player.id);
                  return (
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
                      <td className="px-4 py-3 text-right text-purple-400">{(player.total_rake ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${badge.className}`}>
                            {badge.label}
                          </span>
                          <select
                            value={player.role}
                            onChange={e => handleSetRole(player.id, e.target.value)}
                            className="text-xs bg-black/40 border border-white/20 rounded px-1 py-0.5 text-white/70 focus:outline-none focus:border-gold/50"
                          >
                            <option value="user">user</option>
                            <option value="agent">agent</option>
                            <option value="admin">admin</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <select
                          value={player.agent_id ?? ''}
                          onChange={e => handleAssignAgent(player.id, e.target.value || null)}
                          className="text-xs bg-black/40 border border-white/20 rounded px-1.5 py-0.5 text-white/70 focus:outline-none focus:border-blue-400/50 max-w-[110px]"
                        >
                          <option value="">— None —</option>
                          {assignableAgents.map(a => (
                            <option key={a.id} value={a.id}>{a.nickname}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => { setAddChipsPlayerId(player.id); setChipsMessage(''); setChipAmount(''); }}
                          className="text-xs px-2 py-1 rounded bg-gold/20 border border-gold/40 text-gold hover:bg-gold/30 transition-colors"
                        >
                          Add Chips
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {players.filter(p => p.nickname.toLowerCase().includes(playerSearch.toLowerCase())).length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-white/30">No players found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </div>
        )}

        {/* Agents Tab */}
        {activeTab === 'agents' && (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Search agents…"
              value={agentSearch}
              onChange={e => setAgentSearch(e.target.value)}
              className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-gold/50 text-sm"
            />
            <div className="bg-black/60 border border-white/10 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-white/50 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Agent</th>
                    <th className="px-4 py-3 text-right">Game Chips</th>
                    <th className="px-4 py-3 text-right">Pool Balance</th>
                    <th className="px-4 py-3 text-right">Players</th>
                    <th className="px-4 py-3 text-right">Player Rake</th>
                    <th className="px-4 py-3 text-center">Rakeback %</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.filter(a => a.nickname.toLowerCase().includes(agentSearch.toLowerCase())).map((agent, i) => (
                    <>
                      <tr key={agent.id} className={`border-b border-white/5 ${i % 2 === 0 ? 'bg-white/5' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <img src={agent.avatar_url} alt="" className="w-7 h-7 rounded-full border border-white/20 object-cover" />
                            <span className="font-medium">{agent.nickname}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-white/70">{agent.chips.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gold font-semibold">{agent.agent_chip_pool.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-white/50">{agent.player_count}</td>
                        <td className="px-4 py-3 text-right text-purple-400">{(agent.total_rake ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={rakebackEdits[agent.id] ?? agent.rakeback_percent}
                              onChange={e => setRakebackEdits(prev => ({ ...prev, [agent.id]: e.target.value }))}
                              className="w-14 bg-black/40 border border-white/20 rounded px-1.5 py-0.5 text-white text-xs text-center focus:outline-none focus:border-gold/50"
                            />
                            <span className="text-white/40 text-xs">%</span>
                            {rakebackEdits[agent.id] !== undefined && rakebackEdits[agent.id] !== String(agent.rakeback_percent) && (
                              <button
                                onClick={() => handleSetRakeback(agent.id, parseInt(rakebackEdits[agent.id], 10))}
                                className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 transition-colors"
                              >
                                Save
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setAgentPoolTarget(agent); setAgentPoolAmount(''); }}
                              className="text-xs px-2 py-1 rounded bg-gold/20 border border-gold/40 text-gold hover:bg-gold/30 transition-colors"
                            >
                              Adjust Pool
                            </button>
                            <button
                              onClick={() => {
                                if (expandedAgent === agent.id) {
                                  setExpandedAgent(null);
                                } else {
                                  setExpandedAgent(agent.id);
                                  fetchAgentPlayers(agent.id);
                                }
                              }}
                              className="text-xs px-2 py-1 rounded bg-white/10 border border-white/20 text-white/70 hover:text-white transition-colors"
                            >
                              {expandedAgent === agent.id ? 'Hide' : 'Players'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedAgent === agent.id && (
                        <tr key={`${agent.id}-players`}>
                          <td colSpan={7} className="px-4 pb-3 pt-1 bg-black/20">
                            {!agentPlayers[agent.id] ? (
                              <p className="text-white/30 text-xs py-2">Loading…</p>
                            ) : agentPlayers[agent.id].length === 0 ? (
                              <p className="text-white/30 text-xs py-2">No assigned players</p>
                            ) : (
                              <div className="flex flex-wrap gap-2 py-1">
                                {agentPlayers[agent.id].map(p => (
                                  <div key={p.id} className="flex items-center gap-1.5 bg-white/10 rounded-lg px-2 py-1 text-xs">
                                    <img src={p.avatar_url} alt="" className="w-5 h-5 rounded-full" />
                                    <span>{p.nickname}</span>
                                    <span className="text-gold">{p.chips.toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {agents.filter(a => a.nickname.toLowerCase().includes(agentSearch.toLowerCase())).length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-white/30">No agents found</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-white/30 text-center">
              To make a user an agent, go to the Players tab and change their role.
            </p>
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
                  <p className="text-xs text-white/30 mt-1">Player ID that receives house fees (empty = fee is burned)</p>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1 uppercase tracking-wider">Stake Tiers — Lobby Filter Thresholds</label>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <p className="text-[10px] text-white/30 mb-1">Mid starts at (≥)</p>
                      <input
                        type="number"
                        min="1"
                        value={settingsMidMin}
                        onChange={e => setSettingsMidMin(e.target.value)}
                        className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-gold/50"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-white/30 mb-1">High starts at (≥)</p>
                      <input
                        type="number"
                        min="1"
                        value={settingsHighMin}
                        onChange={e => setSettingsHighMin(e.target.value)}
                        className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-gold/50"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-white/30 mt-1">
                    Low = &lt;{settingsMidMin} · Mid = {settingsMidMin}–{Number(settingsHighMin) - 1} · High = {settingsHighMin}+
                  </p>
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

        {/* ── Rooms Tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'rooms' && (
          <div className="space-y-4">
            {roomsMsg && <div className="bg-gold/20 border border-gold/40 rounded-xl px-4 py-2 text-gold text-sm text-center">{roomsMsg}</div>}

            {/* Sub-tabs */}
            <div className="flex gap-2">
              {(['rooms', 'templates'] as const).map(st => (
                <button key={st} onClick={() => setRoomsSubTab(st)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${roomsSubTab === st ? 'bg-gold text-black border-gold' : 'bg-black/40 border-white/20 text-white/70 hover:text-white'}`}>
                  {st.charAt(0).toUpperCase() + st.slice(1)}
                </button>
              ))}
            </div>

            {/* ─ Rooms list ─────────────────────────────────────────────── */}
            {roomsSubTab === 'rooms' && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-white/50 text-sm">{lobbyRooms.length} room{lobbyRooms.length !== 1 ? 's' : ''}</p>
                  <button onClick={() => setShowRoomForm(v => !v)} className="px-4 py-1.5 rounded-lg bg-gold text-black text-sm font-semibold">
                    {showRoomForm ? 'Cancel' : '+ New Room'}
                  </button>
                </div>

                {showRoomForm && (
                  <form onSubmit={createRoom} className="bg-black/40 border border-white/10 rounded-2xl p-4 space-y-3">
                    <h3 className="font-display text-gold">New Room</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-white/50 text-xs block mb-1">Name</label>
                        <input value={roomForm.name} onChange={e => setRoomForm(f => ({ ...f, name: e.target.value }))} placeholder="Table 1" className="w-full bg-black/40 border border-white/20 rounded-xl px-3 py-2 text-white text-sm" />
                      </div>
                      <div>
                        <label className="text-white/50 text-xs block mb-1">Game</label>
                        <select value={roomForm.gameType} onChange={e => setRoomForm(f => ({ ...f, gameType: e.target.value as GameType }))} className="w-full bg-black/40 border border-white/20 rounded-xl px-3 py-2 text-white text-sm">
                          <option value="poker5o">Poker5O</option>
                          <option value="pazpaz">PazPaz</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-white/50 text-xs block mb-1">Stake</label>
                        <select value={roomForm.stake} onChange={e => setRoomForm(f => ({ ...f, stake: Number(e.target.value) as StakeAmount }))} className="w-full bg-black/40 border border-white/20 rounded-xl px-3 py-2 text-white text-sm">
                          {STAKE_OPTIONS.map(s => <option key={s} value={s}>{s.toLocaleString()}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-white/50 text-xs block mb-1">Display Order</label>
                        <input type="number" value={roomForm.displayOrder} onChange={e => setRoomForm(f => ({ ...f, displayOrder: Number(e.target.value) }))} className="w-full bg-black/40 border border-white/20 rounded-xl px-3 py-2 text-white text-sm" />
                      </div>
                      <div>
                        <label className="text-white/50 text-xs block mb-1"># of Tables</label>
                        <input type="number" min={1} max={20} value={roomForm.count} onChange={e => setRoomForm(f => ({ ...f, count: Math.max(1, Math.min(20, Number(e.target.value))) }))} className="w-full bg-black/40 border border-white/20 rounded-xl px-3 py-2 text-white text-sm" />
                      </div>
                    </div>

                    {roomForm.gameType === 'poker5o' && (
                      <div className="flex flex-wrap gap-3">
                        <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                          <input type="checkbox" checked={roomForm.completeWinBonus} onChange={e => setRoomForm(f => ({ ...f, completeWinBonus: e.target.checked }))} className="accent-gold" />
                          Complete Win Bonus
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-white/50 text-xs">Timer:</span>
                          {([null, 30, 45, 60] as const).map(t => (
                            <button type="button" key={String(t)} onClick={() => setRoomForm(f => ({ ...f, timerDuration: t }))}
                              className={`px-2 py-0.5 rounded text-xs border ${roomForm.timerDuration === t ? 'bg-gold text-black border-gold' : 'border-white/20 text-white/50'}`}>
                              {t === null ? 'Off' : `${t}s`}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {roomForm.gameType === 'pazpaz' && (
                      <div className="flex items-center gap-2">
                        <span className="text-white/50 text-xs">Assignment:</span>
                        {([60, 180, 300] as const).map(d => (
                          <button type="button" key={d} onClick={() => setRoomForm(f => ({ ...f, assignmentDuration: d }))}
                            className={`px-2 py-0.5 rounded text-xs border ${roomForm.assignmentDuration === d ? 'bg-gold text-black border-gold' : 'border-white/20 text-white/50'}`}>
                            {d === 60 ? '1min' : d === 180 ? '3min' : '5min'}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                        <input type="checkbox" checked={roomForm.vocal} onChange={e => setRoomForm(f => ({ ...f, vocal: e.target.checked }))} className="accent-gold" />
                        Voice Chat
                      </label>
                      <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                        <input type="checkbox" checked={roomForm.isRecurring} onChange={e => setRoomForm(f => ({ ...f, isRecurring: e.target.checked }))} className="accent-gold" />
                        Recurring (auto-reset)
                      </label>
                      <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                        <input type="checkbox" checked={roomForm.isPrivate} onChange={e => setRoomForm(f => ({ ...f, isPrivate: e.target.checked }))} className="accent-gold" />
                        Password Protected
                      </label>
                      <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                        <input type="checkbox" checked={roomForm.withBot} onChange={e => setRoomForm(f => ({ ...f, withBot: e.target.checked }))} className="accent-gold" />
                        🤖 Bot Player
                      </label>
                    </div>

                    {roomForm.isPrivate && (
                      <input value={roomForm.password} onChange={e => setRoomForm(f => ({ ...f, password: e.target.value }))} placeholder="Room password" className="w-full bg-black/40 border border-white/20 rounded-xl px-3 py-2 text-white text-sm" />
                    )}

                    <button type="submit" className="px-6 py-2 bg-gold text-black rounded-xl font-semibold text-sm">
                      {roomForm.count > 1 ? `Create ${roomForm.count} Rooms` : 'Create Room'}
                    </button>
                  </form>
                )}

                <div className="space-y-2">
                  {lobbyRooms.map(room => {
                    const statusColor = room.status === 'playing' ? '#FF3366' : room.status === 'waiting' ? '#00FF9D' : '#555';
                    return (
                      <div key={room.id} className="bg-black/40 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold text-sm truncate">{room.name}</p>
                          <p className="text-white/40 text-xs">
                            {room.gameType} · {room.stake.toLocaleString()} chips
                            {room.completeWinBonus && ' · 2× bonus'}
                            {room.timerDuration && ` · ${room.timerDuration}s timer`}
                            {room.isRecurring && ' · recurring'}
                            {room.isPrivate && ' · 🔒'}
                            {room.vocal && ' · 🎙'}
                          </p>
                          {room.status === 'waiting' && <p className="text-[#00FF9D] text-xs mt-0.5">Waiting: {room.waitingPlayerName}</p>}
                          {room.status === 'playing' && <p className="text-[#FF3366] text-xs mt-0.5">Game in progress</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {room.status !== 'empty' && (
                            <button onClick={() => resetRoom(room.id)} className="text-xs border border-white/20 text-white/50 hover:text-white px-2 py-1 rounded transition-colors">Reset</button>
                          )}
                          <button onClick={() => deleteRoom(room.id)} className="text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 px-2 py-1 rounded transition-colors">Delete</button>
                        </div>
                      </div>
                    );
                  })}
                  {lobbyRooms.length === 0 && <p className="text-white/30 text-sm text-center py-6">No rooms. Create one above.</p>}
                </div>
              </div>
            )}

            {/* ─ Templates ──────────────────────────────────────────────── */}
            {roomsSubTab === 'templates' && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-white/50 text-sm">{lobbyTemplates.length} template{lobbyTemplates.length !== 1 ? 's' : ''}</p>
                  <button onClick={() => setShowTemplateForm(v => !v)} className="px-4 py-1.5 rounded-lg bg-gold text-black text-sm font-semibold">
                    {showTemplateForm ? 'Cancel' : '+ New Template'}
                  </button>
                </div>

                {showTemplateForm && (
                  <form onSubmit={createTemplate} className="bg-black/40 border border-white/10 rounded-2xl p-4 space-y-3">
                    <h3 className="font-display text-gold">New Template</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-white/50 text-xs block mb-1">Name</label>
                        <input value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} required placeholder="Template name" className="w-full bg-black/40 border border-white/20 rounded-xl px-3 py-2 text-white text-sm" />
                      </div>
                      <div>
                        <label className="text-white/50 text-xs block mb-1">Game</label>
                        <select value={templateForm.gameType} onChange={e => setTemplateForm(f => ({ ...f, gameType: e.target.value as GameType }))} className="w-full bg-black/40 border border-white/20 rounded-xl px-3 py-2 text-white text-sm">
                          <option value="poker5o">Poker5O</option>
                          <option value="pazpaz">PazPaz</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-white/50 text-xs block mb-1">Stake</label>
                        <select value={templateForm.stake} onChange={e => setTemplateForm(f => ({ ...f, stake: Number(e.target.value) as StakeAmount }))} className="w-full bg-black/40 border border-white/20 rounded-xl px-3 py-2 text-white text-sm">
                          {STAKE_OPTIONS.map(s => <option key={s} value={s}>{s.toLocaleString()}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                        <input type="checkbox" checked={templateForm.isRecurring} onChange={e => setTemplateForm(f => ({ ...f, isRecurring: e.target.checked }))} className="accent-gold" />
                        Recurring
                      </label>
                      <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                        <input type="checkbox" checked={templateForm.vocal} onChange={e => setTemplateForm(f => ({ ...f, vocal: e.target.checked }))} className="accent-gold" />
                        Voice Chat
                      </label>
                    </div>
                    <button type="submit" className="px-6 py-2 bg-gold text-black rounded-xl font-semibold text-sm">Save Template</button>
                  </form>
                )}

                <div className="space-y-2">
                  {lobbyTemplates.map(t => (
                    <div key={t.id} className="bg-black/40 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm">{t.name}</p>
                        <p className="text-white/40 text-xs">{t.gameType} · {t.stake.toLocaleString()} chips{t.isRecurring ? ' · recurring' : ''}{t.vocal ? ' · 🎙' : ''}</p>
                      </div>
                      <button onClick={() => createRoomFromTemplate(t)} className="text-xs border border-gold/40 text-gold hover:bg-gold/10 px-3 py-1 rounded transition-colors">Use</button>
                      <button onClick={() => deleteTemplate(t.id)} className="text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 px-2 py-1 rounded transition-colors">Delete</button>
                    </div>
                  ))}
                  {lobbyTemplates.length === 0 && <p className="text-white/30 text-sm text-center py-6">No templates yet.</p>}
                </div>
              </div>
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

      {/* Agent Pool Modal */}
      {agentPoolTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setAgentPoolTarget(null)}>
          <div className="bg-black/90 border border-white/10 rounded-2xl p-6 w-full max-w-xs shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg text-gold text-center">Adjust Agent Pool</h3>
            <p className="text-white/50 text-xs text-center">
              Agent: <span className="text-white">{agentPoolTarget.nickname}</span>
              <br />Current pool: <span className="text-gold">{agentPoolTarget.agent_chip_pool.toLocaleString()}</span>
            </p>
            <form onSubmit={handleAgentPool} className="space-y-3">
              <input
                type="number"
                value={agentPoolAmount}
                onChange={e => setAgentPoolAmount(e.target.value)}
                placeholder="Amount (negative to reduce)"
                className="w-full bg-black/40 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-gold/50"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setAgentPoolTarget(null)} className="flex-1 py-2 rounded-xl border border-white/20 text-white/70 hover:text-white text-sm transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-2 rounded-xl bg-gold text-black font-semibold hover:bg-yellow-400 text-sm transition-colors">Apply</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
