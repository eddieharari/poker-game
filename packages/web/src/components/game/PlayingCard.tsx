import type { Card } from '@poker5o/shared';
import { usePreferencesStore } from '../../store/preferencesStore.js';

const SUIT_SYMBOL: Record<string, string> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};

const FOUR_COLOR_BG: Record<string, string> = {
  spades:   '#111827',
  clubs:    '#16a34a',
  diamonds: '#2563eb',
  hearts:   '#dc2626',
};

const CLASSIC_INK: Record<string, string> = {
  spades:   '#111827',
  clubs:    '#111827',
  diamonds: '#dc2626',
  hearts:   '#dc2626',
};

interface Props {
  card: Card;
  width?: number;
  height?: number;
}

export function PlayingCard({ card, width = 56, height = 84 }: Props) {
  const fourColorDeck = usePreferencesStore(s => s.fourColorDeck);

  if (card.faceDown) {
    return (
      <div
        style={{ width, height }}
        className="rounded-lg bg-gradient-to-br from-blue-900 to-blue-800 border border-blue-700 shadow-md"
      />
    );
  }

  const symbol = SUIT_SYMBOL[card.suit];
  const bgColor  = fourColorDeck ? FOUR_COLOR_BG[card.suit] : '#ffffff';
  const inkColor = fourColorDeck ? '#ffffff' : CLASSIC_INK[card.suit];
  const borderClass = fourColorDeck ? 'border border-white/20' : 'border border-gray-300';

  return (
    <div
      style={{ width, height, backgroundColor: bgColor, color: inkColor }}
      className={`rounded-lg shadow-md select-none relative overflow-hidden ${borderClass}`}
    >
      {/* Top-left corner */}
      <div className="absolute top-0.5 left-1 leading-none">
        <div className="font-black leading-tight" style={{ fontSize: Math.round(height * 0.13) }}>{card.rank}</div>
        <div className="font-black leading-tight" style={{ fontSize: Math.round(height * 0.11) }}>{symbol}</div>
      </div>
      {/* Centre suit */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span style={{ fontSize: height * 0.28 }}>{symbol}</span>
      </div>
      {/* Bottom-right corner (rotated) */}
      <div className="absolute bottom-0.5 right-1 leading-none rotate-180">
        <div className="font-black leading-tight" style={{ fontSize: Math.round(height * 0.13) }}>{card.rank}</div>
        <div className="font-black leading-tight" style={{ fontSize: Math.round(height * 0.11) }}>{symbol}</div>
      </div>
    </div>
  );
}
