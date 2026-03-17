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
  hideFlippedCorners?: boolean; // kept for API compatibility, no longer used
}

export function PlayingCard({ card, width = 56, height = 84 }: Props) {
  const { fourColorDeck, twoCornerDeck } = usePreferencesStore();

  if (card.faceDown) {
    return (
      <div
        style={{
          width,
          height,
          background: `
            repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 0, transparent 50%),
            repeating-linear-gradient(-45deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 0, transparent 50%),
            linear-gradient(135deg, #1e3a8a, #1e40af)
          `,
          backgroundSize: '10px 10px, 10px 10px, 100% 100%',
        }}
        className="rounded-lg border border-blue-700 shadow-md"
      />
    );
  }

  const symbol = SUIT_SYMBOL[card.suit];
  const bgColor  = fourColorDeck ? FOUR_COLOR_BG[card.suit] : '#ffffff';
  const inkColor = fourColorDeck ? '#ffffff' : CLASSIC_INK[card.suit];
  const borderClass = fourColorDeck ? 'border border-white/20' : 'border border-gray-300';

  const rankSize = Math.round(height * 0.13);
  const suitSize = Math.round(height * 0.11);

  return (
    <div
      style={{ width, height, backgroundColor: bgColor, color: inkColor }}
      className={`rounded-lg shadow-md select-none relative overflow-hidden ${borderClass}`}
    >
      {/* Top-left corner */}
      <div className="absolute top-0.5 left-1 leading-none">
        <div className="font-black leading-tight" style={{ fontSize: rankSize }}>{card.rank}</div>
        <div className="font-black leading-tight" style={{ fontSize: suitSize }}>{symbol}</div>
      </div>

      {/* Top-right corner — 4-corner mode only */}
      {!twoCornerDeck && (
        <div className="absolute top-0.5 right-1 leading-none">
          <div className="font-black leading-tight" style={{ fontSize: rankSize }}>{card.rank}</div>
          <div className="font-black leading-tight" style={{ fontSize: suitSize }}>{symbol}</div>
        </div>
      )}

      {/* Centre suit */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span style={{ fontSize: height * 0.28 }}>{symbol}</span>
      </div>

      {/* Bottom-left corner — 4-corner mode only, readable (no rotation) */}
      {!twoCornerDeck && (
        <div className="absolute bottom-0.5 left-1 leading-none">
          <div className="font-black leading-tight" style={{ fontSize: rankSize }}>{card.rank}</div>
          <div className="font-black leading-tight" style={{ fontSize: suitSize }}>{symbol}</div>
        </div>
      )}

      {/* Bottom-right corner — always shown, readable (no rotation) */}
      <div className="absolute bottom-0.5 right-1 leading-none">
        <div className="font-black leading-tight" style={{ fontSize: rankSize }}>{card.rank}</div>
        <div className="font-black leading-tight" style={{ fontSize: suitSize }}>{symbol}</div>
      </div>
    </div>
  );
}
