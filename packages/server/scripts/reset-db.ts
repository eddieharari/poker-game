/**
 * reset-db.ts
 *
 * Deletes all game history and resets every player's balance/stats to zero,
 * while keeping all user accounts intact.
 *
 * Tables cleared:  chip_transactions, chip_requests, games
 * Columns reset:   profiles.chips, wins, losses, draws, agent_chip_pool, total_rake
 *
 * Usage:
 *   npx tsx scripts/reset-db.ts              (prompts for confirmation)
 *   npx tsx scripts/reset-db.ts --yes        (skip prompt — use in CI)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

// ─── Supabase client ──────────────────────────────────────────────────────────

const SUPABASE_URL             = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Confirmation prompt ──────────────────────────────────────────────────────

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

// ─── Reset logic ─────────────────────────────────────────────────────────────

async function resetDatabase(): Promise<void> {
  const skipPrompt = process.argv.includes('--yes');

  console.log('\n⚠️  POKER GAME DATABASE RESET');
  console.log('────────────────────────────────────────────');
  console.log('This will permanently:');
  console.log('  • Delete ALL game records');
  console.log('  • Delete ALL chip transactions');
  console.log('  • Delete ALL chip requests');
  console.log('  • Reset ALL player balances to 0');
  console.log('  • Reset ALL player stats (wins / losses / draws) to 0');
  console.log('  • Reset ALL agent chip pools and rake totals to 0');
  console.log('  ✅ User accounts and profiles will be KEPT');
  console.log('────────────────────────────────────────────');
  console.log(`Target: ${SUPABASE_URL}\n`);

  if (!skipPrompt) {
    const ok = await confirm('Type "yes" to confirm: ');
    if (!ok) {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  console.log('\nStarting reset…\n');

  // 1. Delete chip_transactions first (FK → games)
  console.log('  Deleting chip_transactions…');
  const { error: e1 } = await supabase
    .from('chip_transactions')
    .delete()
    .gte('created_at', '1970-01-01'); // match all rows
  if (e1) throw new Error(`chip_transactions: ${e1.message}`);
  console.log('  ✓ chip_transactions cleared');

  // 2. Delete chip_requests
  console.log('  Deleting chip_requests…');
  const { error: e2 } = await supabase
    .from('chip_requests')
    .delete()
    .gte('created_at', '1970-01-01');
  if (e2) throw new Error(`chip_requests: ${e2.message}`);
  console.log('  ✓ chip_requests cleared');

  // 3. Delete games
  console.log('  Deleting games…');
  const { error: e3 } = await supabase
    .from('games')
    .delete()
    .gte('started_at', '1970-01-01');
  if (e3) throw new Error(`games: ${e3.message}`);
  console.log('  ✓ games cleared');

  // 4. Reset all profile balances and stats
  console.log('  Resetting player balances and stats…');
  const { error: e4 } = await supabase
    .from('profiles')
    .update({
      chips:           0,
      wins:            0,
      losses:          0,
      draws:           0,
      agent_chip_pool: 0,
      total_rake:      0,
    })
    .gte('created_at', '1970-01-01'); // match all rows
  if (e4) throw new Error(`profiles update: ${e4.message}`);
  console.log('  ✓ player balances and stats reset to 0');

  console.log('\n✅  Database reset complete.\n');
}

resetDatabase().catch(err => {
  console.error('\n❌  Reset failed:', err.message ?? err);
  process.exit(1);
});
