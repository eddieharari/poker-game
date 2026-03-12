import { describe, it, expect } from 'vitest';
import { createDeck, shuffleDeck, drawCard } from '../utils/deck.js';

describe('createDeck', () => {
  it('creates 52 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    const keys = deck.map(c => `${c.rank}-${c.suit}`);
    expect(new Set(keys).size).toBe(52);
  });
});

describe('shuffleDeck', () => {
  it('returns same 52 cards in a different order', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled).toHaveLength(52);
    // Same cards
    const original = deck.map(c => `${c.rank}-${c.suit}`).sort();
    const shuffledKeys = shuffled.map(c => `${c.rank}-${c.suit}`).sort();
    expect(shuffledKeys).toEqual(original);
  });

  it('does not mutate original deck', () => {
    const deck = createDeck();
    const copy = [...deck];
    shuffleDeck(deck);
    expect(deck).toEqual(copy);
  });
});

describe('drawCard', () => {
  it('removes the first card and returns remaining', () => {
    const deck = createDeck();
    const [card, rest] = drawCard(deck);
    expect(card).toEqual(deck[0]);
    expect(rest).toHaveLength(51);
    expect(rest).not.toContain(card);
  });

  it('throws on empty deck', () => {
    expect(() => drawCard([])).toThrow();
  });
});
