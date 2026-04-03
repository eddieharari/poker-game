import { Router } from 'express';
import { lobbyService } from '../services/lobbyService.js';
import { settingsService } from '../services/settingsService.js';

const router = Router();

// HTTP fallback — list of currently online players
router.get('/players', async (_req, res) => {
  const players = await lobbyService.getAllPlayers();
  res.json(players);
});

// Public — stake tier thresholds for lobby filters
router.get('/stake-tiers', async (_req, res) => {
  const s = await settingsService.get();
  res.json({ stakeMidMin: s.stakeMidMin, stakeHighMin: s.stakeHighMin });
});

export { router as lobbyRouter };
