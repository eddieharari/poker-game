import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

/**
 * All profile routes require a valid Supabase JWT in Authorization header.
 * We verify it here and attach the userId to the request.
 */
async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'Missing token' }); return; }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) { res.status(401).json({ error: 'Invalid token' }); return; }

  (req as express.Request & { userId: string }).userId = data.user.id;
  next();
}

import express from 'express';

// GET /profile/check-nickname/:nickname
// Returns { available: boolean } — used for real-time uniqueness check during onboarding
router.get('/check-nickname/:nickname', async (req, res) => {
  const { nickname } = req.params;

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(nickname)) {
    res.json({ available: false, reason: 'Invalid format' });
    return;
  }

  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('nickname', nickname)
    .maybeSingle();

  res.json({ available: data === null });
});

// GET /profile/me — fetch own profile
router.get('/me', requireAuth, async (req, res) => {
  const userId = (req as express.Request & { userId: string }).userId;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url, avatar_is_preset, wins, losses, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) { res.status(500).json({ error: error.message }); return; }
  if (!data)  { res.status(404).json({ error: 'Profile not found' }); return; }

  res.json(data);
});

// POST /profile — create profile (onboarding — called once)
router.post('/', requireAuth, async (req, res) => {
  const userId = (req as express.Request & { userId: string }).userId;
  const { nickname, avatarUrl, avatarIsPreset } = req.body as {
    nickname?: string;
    avatarUrl?: string;
    avatarIsPreset?: boolean;
  };

  if (!nickname || !/^[a-zA-Z0-9_]{3,20}$/.test(nickname)) {
    res.status(400).json({ error: 'Invalid nickname' });
    return;
  }
  if (!avatarUrl) {
    res.status(400).json({ error: 'Avatar is required' });
    return;
  }

  // Check uniqueness one final time before insert
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('nickname', nickname)
    .maybeSingle();

  if (existing) {
    res.status(409).json({ error: 'Nickname already taken' });
    return;
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      nickname,
      avatar_url: avatarUrl,
      avatar_is_preset: avatarIsPreset ?? true,
    })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  res.status(201).json(data);
});

// PATCH /profile/avatar — update avatar only
router.patch('/avatar', requireAuth, async (req, res) => {
  const userId = (req as express.Request & { userId: string }).userId;
  const { avatarUrl, avatarIsPreset } = req.body as {
    avatarUrl?: string;
    avatarIsPreset?: boolean;
  };

  if (!avatarUrl) { res.status(400).json({ error: 'avatarUrl is required' }); return; }

  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl, avatar_is_preset: avatarIsPreset ?? true })
    .eq('id', userId)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  res.json(data);
});

export { router as profileRouter };
