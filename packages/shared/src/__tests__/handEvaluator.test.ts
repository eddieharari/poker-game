import { describe, it, expect } from 'vitest';
import { evaluateHand, compareHands } from '../engine/handEvaluator.js';
import { HandRank } from '../types/index.js';
import type { Card } from '../types/index.js';

function c(rank: string, suit: string): Card {
  return { rank: rank as Card['rank'], suit: suit as Card['suit'] };
}

describe('evaluateHand', () => {
  it('identifies Royal Flush', () => {
    const hand = [c('A','spades'), c('K','spades'), c('Q','spades'), c('J','spades'), c('10','spades')];
    const result = evaluateHand(hand);
    expect(result.rank).toBe(HandRank.ROYAL_FLUSH);
    expect(result.tiebreakers[0]).toBe(1);
  });

  it('identifies Straight Flush', () => {
    const hand = [c('9','hearts'), c('8','hearts'), c('7','hearts'), c('6','hearts'), c('5','hearts')];
    const result = evaluateHand(hand);
    expect(result.rank).toBe(HandRank.STRAIGHT_FLUSH);
  });

  it('identifies Four of a Kind', () => {
    const hand = [c('A','spades'), c('A','hearts'), c('A','diamonds'), c('A','clubs'), c('K','spades')];
    const result = evaluateHand(hand);
    expect(result.rank).toBe(HandRank.FOUR_OF_A_KIND);
  });

  it('identifies Full House', () => {
    const hand = [c('K','spades'), c('K','hearts'), c('K','diamonds'), c('Q','clubs'), c('Q','spades')];
    const result = evaluateHand(hand);
    expect(result.rank).toBe(HandRank.FULL_HOUSE);
  });

  it('identifies Flush', () => {
    const hand = [c('A','clubs'), c('J','clubs'), c('9','clubs'), c('6','clubs'), c('2','clubs')];
    const result = evaluateHand(hand);
    expect(result.rank).toBe(HandRank.FLUSH);
  });

  it('identifies Straight', () => {
    const hand = [c('9','spades'), c('8','hearts'), c('7','diamonds'), c('6','clubs'), c('5','spades')];
    const result = evaluateHand(hand);
    expect(result.rank).toBe(HandRank.STRAIGHT);
  });

  it('identifies Three of a Kind', () => {
    const hand = [c('7','spades'), c('7','hearts'), c('7','diamonds'), c('K','clubs'), c('2','spades')];
    const result = evaluateHand(hand);
    expect(result.rank).toBe(HandRank.THREE_OF_A_KIND);
  });

  it('identifies Two Pair', () => {
    const hand = [c('A','spades'), c('A','hearts'), c('K','diamonds'), c('K','clubs'), c('Q','spades')];
    const result = evaluateHand(hand);
    expect(result.rank).toBe(HandRank.TWO_PAIR);
  });

  it('identifies One Pair', () => {
    const hand = [c('J','spades'), c('J','hearts'), c('9','diamonds'), c('6','clubs'), c('2','spades')];
    const result = evaluateHand(hand);
    expect(result.rank).toBe(HandRank.ONE_PAIR);
  });

  it('identifies High Card', () => {
    const hand = [c('A','spades'), c('J','hearts'), c('9','diamonds'), c('6','clubs'), c('2','spades')];
    const result = evaluateHand(hand);
    expect(result.rank).toBe(HandRank.HIGH_CARD);
  });

  it('throws on wrong number of cards', () => {
    expect(() => evaluateHand([c('A','spades')])).toThrow();
  });
});

describe('compareHands', () => {
  it('Royal Flush beats Straight Flush', () => {
    const rf = evaluateHand([c('A','spades'), c('K','spades'), c('Q','spades'), c('J','spades'), c('10','spades')]);
    const sf = evaluateHand([c('9','hearts'), c('8','hearts'), c('7','hearts'), c('6','hearts'), c('5','hearts')]);
    expect(compareHands(rf, sf)).toBe(1);
    expect(compareHands(sf, rf)).toBe(-1);
  });

  it('same hand is a tie', () => {
    const h1 = evaluateHand([c('A','spades'), c('K','hearts'), c('Q','diamonds'), c('J','clubs'), c('9','spades')]);
    const h2 = evaluateHand([c('A','hearts'), c('K','spades'), c('Q','clubs'), c('J','diamonds'), c('9','hearts')]);
    expect(compareHands(h1, h2)).toBe(0);
  });
});
