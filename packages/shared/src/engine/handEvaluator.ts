/**
 * Cactus Kev hand evaluator for 5-card poker hands.
 *
 * Card encoding (32-bit int):
 *   Bits 0-7:   prime number for rank (2→2, 3→3, 4→5, 5→7, 6→11, 7→13, 8→17,
 *               9→19, T→23, J→29, Q→31, K→37, A→41)
 *   Bits 8-11:  rank index 0-12
 *   Bit  12-15: suit bit (one of 0x1000, 0x2000, 0x4000, 0x8000)
 *   Bits 16-28: rank bitmask (bit 16 = deuce, bit 28 = ace)
 *
 * Strength value: 1 (Royal Flush) … 7462 (7-5-4-3-2 offsuit) — lower = better.
 */

import type { Card, HandEvaluation } from '../types/index.js';
import { HandRank, HAND_RANK_LABEL } from '../types/index.js';
import { RANK_VALUE } from '../utils/deck.js';

// ─── Card Encoding ────────────────────────────────────────────────────────────

const RANK_PRIMES: Record<string, number> = {
  '2': 2,  '3': 3,  '4': 5,  '5': 7,  '6': 11, '7': 13, '8': 17,
  '9': 19, '10': 23, 'J': 29, 'Q': 31, 'K': 37, 'A': 41,
};

const SUIT_BITS: Record<string, number> = {
  spades: 0x1000, hearts: 0x2000, diamonds: 0x4000, clubs: 0x8000,
};

function encodeCard(card: Card): number {
  const rankIdx = RANK_VALUE[card.rank] - 2; // 0-12
  const prime   = RANK_PRIMES[card.rank];
  const suitBit = SUIT_BITS[card.suit];
  const rankBit = 1 << (16 + rankIdx);
  return prime | (rankIdx << 8) | suitBit | rankBit;
}

// ─── Lookup Tables ────────────────────────────────────────────────────────────

/** Maps 13-bit rank bitmask → strength for flushes (1-based CK values) */
const FLUSH_RANK = new Map<number, number>();

/** Maps product of 5 rank primes → strength for non-flush hands */
const PROD_TO_RANK = new Map<number, number>();

// Strength bands (CK): 1-10 SF, 11-166 Quads, 167-322 FH, 323-1599 Flush,
//   1600-1609 Straight, 1610-2467 Trips, 2468-3325 2P, 3326-6185 Pair, 6186-7462 HC
// Counts: Quads=156, FH=156, Flush=1277, Straight=10, Trips=858, 2P=858, Pair=2860, HC=1277
function buildLookupTables(): void {
  const primes = [2,3,5,7,11,13,17,19,23,29,31,37,41]; // rank 0-12 (2 through A)

  // ── Straight detection ────────────────────────────────────────────────────
  const straights = new Set<number>();
  for (let top = 4; top <= 12; top++) {
    let mask = 0;
    for (let i = 0; i < 5; i++) mask |= 1 << (top - i);
    straights.add(mask);
  }
  const wheelMask = (1 << 12) | 0b1111; // A2345
  straights.add(wheelMask);

  // Straights ordered best→worst: A-high (top=12) … 6-high (top=4), then wheel (A2345)
  const sortedStraightMasks: number[] = [];
  for (let top = 12; top >= 4; top--) {
    let mask = 0;
    for (let i = 0; i < 5; i++) mask |= 1 << (top - i);
    sortedStraightMasks.push(mask);
  }
  sortedStraightMasks.push(wheelMask);

  // ── FLUSH_RANK table ──────────────────────────────────────────────────────
  // Straight flushes (strength 1-10): best→worst
  let sfStrength = 1;
  for (const mask of sortedStraightMasks) {
    FLUSH_RANK.set(mask, sfStrength++);
  }
  // Regular flushes (strength 323-1599): highest ranks first
  let flushStrength = 323;
  for (let a = 12; a >= 0; a--)
    for (let b = a-1; b >= 0; b--)
      for (let c = b-1; c >= 0; c--)
        for (let d = c-1; d >= 0; d--)
          for (let e = d-1; e >= 0; e--) {
            const mask = (1<<a)|(1<<b)|(1<<c)|(1<<d)|(1<<e);
            if (!straights.has(mask)) FLUSH_RANK.set(mask, flushStrength++);
          }

  // ── PROD_TO_RANK table ────────────────────────────────────────────────────
  // Each hand category is enumerated in correct poker order so that the primary
  // rank key (quad rank, trips rank, pair rank, etc.) drives strength assignment,
  // not the sorted card values. This fixes the bug where pair-of-2s with high
  // kickers could outrank pair-of-5s with low kickers.

  let qStrength  = 11;
  let fhStrength = 167;
  let stStrength = 1600;
  let trStrength = 1610;
  let tpStrength = 2468;
  let prStrength = 3326;
  let hcStrength = 6186;

  // QUADS (156): primary = quad rank desc, secondary = kicker desc
  for (let q = 12; q >= 0; q--)
    for (let k = 12; k >= 0; k--) {
      if (k === q) continue;
      PROD_TO_RANK.set(primes[q]**4 * primes[k], qStrength++);
    }

  // FULL HOUSE (156): primary = trips rank desc, secondary = pair rank desc
  for (let t = 12; t >= 0; t--)
    for (let p = 12; p >= 0; p--) {
      if (p === t) continue;
      PROD_TO_RANK.set(primes[t]**3 * primes[p]**2, fhStrength++);
    }

  // STRAIGHTS (10): A-high … wheel
  for (const mask of sortedStraightMasks) {
    const ranks: number[] = [];
    for (let r = 12; r >= 0; r--) if (mask & (1 << r)) ranks.push(r);
    PROD_TO_RANK.set(ranks.reduce((p, r) => p * primes[r], 1), stStrength++);
  }

  // TRIPS (858): primary = trips rank desc, then kicker1 desc, kicker2 desc
  for (let t = 12; t >= 0; t--)
    for (let k1 = 12; k1 >= 0; k1--) {
      if (k1 === t) continue;
      for (let k2 = k1 - 1; k2 >= 0; k2--) {
        if (k2 === t) continue;
        PROD_TO_RANK.set(primes[t]**3 * primes[k1] * primes[k2], trStrength++);
      }
    }

  // TWO PAIR (858): primary = high-pair rank desc, secondary = low-pair rank desc, then kicker desc
  for (let p1 = 12; p1 >= 0; p1--)
    for (let p2 = p1 - 1; p2 >= 0; p2--)
      for (let k = 12; k >= 0; k--) {
        if (k === p1 || k === p2) continue;
        PROD_TO_RANK.set(primes[p1]**2 * primes[p2]**2 * primes[k], tpStrength++);
      }

  // PAIR (2860): primary = pair rank desc, then kicker1 desc, kicker2 desc, kicker3 desc
  for (let p = 12; p >= 0; p--)
    for (let k1 = 12; k1 >= 0; k1--) {
      if (k1 === p) continue;
      for (let k2 = k1 - 1; k2 >= 0; k2--) {
        if (k2 === p) continue;
        for (let k3 = k2 - 1; k3 >= 0; k3--) {
          if (k3 === p) continue;
          PROD_TO_RANK.set(primes[p]**2 * primes[k1] * primes[k2] * primes[k3], prStrength++);
        }
      }
    }

  // HIGH CARD (1277): all 5-distinct-rank non-straight combos, highest card first
  for (let a = 12; a >= 0; a--)
    for (let b = a-1; b >= 0; b--)
      for (let c = b-1; c >= 0; c--)
        for (let d = c-1; d >= 0; d--)
          for (let e = d-1; e >= 0; e--) {
            const mask = (1<<a)|(1<<b)|(1<<c)|(1<<d)|(1<<e);
            if (straights.has(mask)) continue;
            PROD_TO_RANK.set(primes[a] * primes[b] * primes[c] * primes[d] * primes[e], hcStrength++);
          }
}

buildLookupTables();

// ─── Strength → HandRank ──────────────────────────────────────────────────────

function strengthToHandRank(s: number): HandRank {
  if (s === 1)         return HandRank.ROYAL_FLUSH;
  if (s <= 10)         return HandRank.STRAIGHT_FLUSH;
  if (s <= 166)        return HandRank.FOUR_OF_A_KIND;
  if (s <= 322)        return HandRank.FULL_HOUSE;
  if (s <= 1599)       return HandRank.FLUSH;
  if (s <= 1609)       return HandRank.STRAIGHT;
  if (s <= 2467)       return HandRank.THREE_OF_A_KIND;
  if (s <= 3325)       return HandRank.TWO_PAIR;
  if (s <= 6185)       return HandRank.ONE_PAIR;
  return HandRank.HIGH_CARD;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Evaluate a 5-card hand. Returns HandEvaluation with CK strength as tiebreaker. */
export function evaluateHand(cards: Card[]): HandEvaluation {
  if (cards.length !== 5) throw new Error('evaluateHand requires exactly 5 cards');

  const encoded = cards.map(encodeCard);

  // Check flush: all suit bits identical
  const isFlush = encoded.every(c => (c & 0xF000) === (encoded[0] & 0xF000));

  let strength: number;
  if (isFlush) {
    const rankMask = encoded.reduce((m, c) => m | (c >>> 16), 0) & 0x1FFF;
    strength = FLUSH_RANK.get(rankMask) ?? 7462;
  } else {
    const prod = encoded.reduce((p, c) => p * (c & 0xFF), 1);
    strength = PROD_TO_RANK.get(prod) ?? 7462;
  }

  const rank = strengthToHandRank(strength);
  return {
    rank,
    label: HAND_RANK_LABEL[rank],
    tiebreakers: [strength],
  };
}

/** Returns 1 if a > b (a wins), -1 if b wins, 0 for tie. Lower strength = better. */
export function compareHands(a: HandEvaluation, b: HandEvaluation): 1 | -1 | 0 {
  const sa = a.tiebreakers[0];
  const sb = b.tiebreakers[0];
  if (sa < sb) return 1;
  if (sa > sb) return -1;
  return 0;
}

/**
 * Evaluate 1-4 cards as a partial hand for turn-order purposes.
 * Returns a weighted score (higher = better potential).
 */
export function evaluatePartialHand(cards: Card[]): number {
  if (cards.length === 0) return 0;
  if (cards.length === 5) return 7463 - evaluateHand(cards).tiebreakers[0];

  // Weighted heuristic: sum of rank values + pair/trips bonuses
  const rankValues = cards.map(c => RANK_VALUE[c.rank]);
  let score = rankValues.reduce((s, v) => s + v, 0);

  const cnt: Record<number, number> = {};
  for (const v of rankValues) cnt[v] = (cnt[v] ?? 0) + 1;
  for (const freq of Object.values(cnt)) {
    if (freq === 2) score += 20;
    else if (freq === 3) score += 60;
    else if (freq === 4) score += 120;
  }

  // Flush draw bonus
  const suitCounts: Record<string, number> = {};
  for (const c of cards) suitCounts[c.suit] = (suitCounts[c.suit] ?? 0) + 1;
  const maxSuit = Math.max(...Object.values(suitCounts));
  if (maxSuit >= 3) score += (maxSuit - 2) * 10;

  return score;
}
