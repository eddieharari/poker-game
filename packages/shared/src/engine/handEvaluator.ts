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

// All 5-card combinations from 13 ranks — for flush table
function buildLookupTables(): void {
  // Ranks 0-12 (deuce through ace)
  const straights = new Set<number>();

  // Detect straight bitmasks (including A-low: A2345)
  for (let top = 4; top <= 12; top++) {
    let mask = 0;
    for (let i = 0; i < 5; i++) mask |= 1 << (top - i);
    straights.add(mask);
  }
  // A-low straight: A2345 → bits 0,1,2,3,12
  straights.add((1 << 12) | 0b1111);

  // Generate all C(13,5) = 1287 rank combinations
  // Strength bands (CK): 1-10 SF, 11-166 Quads, 167-322 FH, 323-1599 Flush,
  //   1600-1609 Straight, 1610-2467 Trips, 2468-3325 2P, 3326-6185 Pair, 6186-7462 HC

  // Enumerate all 5-card rank combos sorted descending for natural ordering
  const combos: number[][] = [];
  for (let a = 12; a >= 0; a--)
    for (let b = a-1; b >= 0; b--)
      for (let c = b-1; c >= 0; c--)
        for (let d = c-1; d >= 0; d--)
          for (let e = d-1; e >= 0; e--)
            combos.push([a, b, c, d, e]);

  // Assign flush strengths: SF first, then regular flush
  let sfStrength = 1;
  let flushStrength = 323; // after SF(1-10), Quads(11-166), FH(167-322)

  for (const ranks of combos) {
    const mask = ranks.reduce((m, r) => m | (1 << r), 0);
    const isStraight = straights.has(mask);
    if (isStraight) {
      FLUSH_RANK.set(mask, sfStrength++);
    }
  }
  for (const ranks of combos) {
    const mask = ranks.reduce((m, r) => m | (1 << r), 0);
    const isStraight = straights.has(mask);
    if (!isStraight) {
      FLUSH_RANK.set(mask, flushStrength++);
    }
  }

  // Non-flush table: enumerate all 5-card rank combos with repetition allowed for pairs etc.
  // We use the product of primes approach.
  // Bands: Quads 11-166, FH 167-322, Straight 1600-1609, Trips 1610-2467,
  //   TwoPair 2468-3325, Pair 3326-6185, HighCard 6186-7462

  // Classify by sorted rank array
  function classify(sorted: number[]): string {
    const cnt: Record<number, number> = {};
    for (const r of sorted) cnt[r] = (cnt[r] ?? 0) + 1;
    const freqs = Object.values(cnt).sort((a, b) => b - a);
    if (freqs[0] === 4) return 'QUADS';
    if (freqs[0] === 3 && freqs[1] === 2) return 'FH';
    if (freqs[0] === 3) return 'TRIPS';
    if (freqs[0] === 2 && freqs[1] === 2) return 'TWOPAIR';
    if (freqs[0] === 2) return 'PAIR';
    const mask = sorted.reduce((m, r) => m | (1 << r), 0);
    if (straights.has(mask)) return 'STRAIGHT';
    return 'HIGHCARD';
  }

  // Strength counters per type
  let qStrength  = 11;
  let fhStrength = 167;
  let stStrength = 1600;
  let trStrength = 1610;
  let tpStrength = 2468;
  let prStrength = 3326;
  let hcStrength = 6186;

  // Enumerate all multi-sets of 5 from 13 ranks (with repetition), sorted desc
  const primes = [2,3,5,7,11,13,17,19,23,29,31,37,41]; // rank 0-12

  for (let a = 12; a >= 0; a--)
  for (let b = a; b >= 0; b--)
  for (let c = b; c >= 0; c--)
  for (let d = c; d >= 0; d--)
  for (let e = d; e >= 0; e--) {
    const sorted = [a,b,c,d,e];
    const prod = primes[a]*primes[b]*primes[c]*primes[d]*primes[e];
    if (PROD_TO_RANK.has(prod)) continue;
    const type = classify(sorted);
    let s: number;
    switch (type) {
      case 'QUADS':    s = qStrength++;  break;
      case 'FH':       s = fhStrength++; break;
      case 'STRAIGHT': s = stStrength++; break;
      case 'TRIPS':    s = trStrength++; break;
      case 'TWOPAIR':  s = tpStrength++; break;
      case 'PAIR':     s = prStrength++; break;
      default:         s = hcStrength++; break;
    }
    PROD_TO_RANK.set(prod, s);
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
