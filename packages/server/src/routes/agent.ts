import { Router } from 'express';
import { supabase } from '../supabase.js';
import { getIo } from '../socket/index.js';

export const agentRouter = Router();

async function getAgentId(req: any): Promise<string | null> {
  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith('Bearer ')) return null;
  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  if (error || !data.user) return null;
  const { data: profile } = await supabase
    .from('profiles').select('id, role').eq('id', data.user.id).single();
  if (!profile || profile.role !== 'agent') return null;
  return profile.id;
}

// GET /api/agent/dashboard
agentRouter.get('/dashboard', async (req: any, res) => {
  const agentId = await getAgentId(req);
  if (!agentId) return res.status(401).json({ error: 'Unauthorized' });

  const { data: agentProfile } = await supabase
    .from('profiles').select('agent_chip_pool, chips').eq('id', agentId).single();

  const { data: players, error } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url, chips, wins, losses, draws, total_rake')
    .eq('agent_id', agentId)
    .order('nickname');

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    pool: agentProfile?.agent_chip_pool ?? 0,
    agentChips: agentProfile?.chips ?? 0,
    players: players ?? [],
  });
});

// POST /api/agent/credit — pool → player chips
agentRouter.post('/credit', async (req: any, res) => {
  const agentId = await getAgentId(req);
  if (!agentId) return res.status(401).json({ error: 'Unauthorized' });

  const { playerId, amount } = req.body;
  if (!playerId || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Invalid params' });
  }

  // Verify player belongs to this agent OR it's the agent themselves
  const { data: player } = await supabase
    .from('profiles').select('agent_id').eq('id', playerId).single();
  if (!player || (player.agent_id !== agentId && playerId !== agentId)) {
    return res.status(403).json({ error: 'Player not assigned to you' });
  }

  const { data: agentProfile } = await supabase
    .from('profiles').select('agent_chip_pool').eq('id', agentId).single();
  if (!agentProfile || agentProfile.agent_chip_pool < amount) {
    return res.status(400).json({ error: 'Insufficient pool balance' });
  }

  const { error } = await supabase.rpc('agent_credit_player', {
    p_agent_id: agentId, p_player_id: playerId, p_amount: amount,
  });
  if (error) return res.status(500).json({ error: error.message });

  const { data: updated } = await supabase.from('profiles').select('chips').eq('id', playerId).single();
  if (updated) getIo()?.to(`player:${playerId}`).emit('profile:chips_updated', { chips: updated.chips });

  res.json({ ok: true });
});

// POST /api/agent/debit — player chips → pool
agentRouter.post('/debit', async (req: any, res) => {
  const agentId = await getAgentId(req);
  if (!agentId) return res.status(401).json({ error: 'Unauthorized' });

  const { playerId, amount } = req.body;
  if (!playerId || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Invalid params' });
  }

  const { data: player } = await supabase
    .from('profiles').select('agent_id, chips').eq('id', playerId).single();
  if (!player || (player.agent_id !== agentId && playerId !== agentId)) {
    return res.status(403).json({ error: 'Player not assigned to you' });
  }
  if (player.chips < amount) {
    return res.status(400).json({ error: 'Player has insufficient chips' });
  }

  const { error } = await supabase.rpc('agent_debit_player', {
    p_agent_id: agentId, p_player_id: playerId, p_amount: amount,
  });
  if (error) return res.status(500).json({ error: error.message });

  const { data: updated } = await supabase.from('profiles').select('chips').eq('id', playerId).single();
  if (updated) getIo()?.to(`player:${playerId}`).emit('profile:chips_updated', { chips: updated.chips });

  res.json({ ok: true });
});
