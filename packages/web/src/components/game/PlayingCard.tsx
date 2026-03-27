import type { Card } from '@poker5o/shared';
import { usePreferencesStore } from '../../store/preferencesStore.js';

const SUIT_SYMBOL: Record<string, string> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};

// Colored-deck backgrounds — vivid, saturated
const SUIT_BG: Record<string, string> = {
  hearts:   '#cc1111', // vivid red
  diamonds: '#1155cc', // vivid blue
  clubs:    '#1a7a36', // vivid green
  spades:   '#1a1a2e', // very dark navy
};

// Classic white-deck ink colors
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
  hideFlippedCorners?: boolean; // kept for API compatibility
}

export function PlayingCard({ card, width = 56, height = 84 }: Props) {
  const { fourColorDeck, twoCornerDeck } = usePreferencesStore();

  // ── Face-down ────────────────────────────────────────────────────────────
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
          borderRadius: Math.max(4, Math.round(width * 0.10)),
        }}
        className="border border-blue-700 shadow-md"
      />
    );
  }

  const symbol = SUIT_SYMBOL[card.suit];

  // ── Colored-background deck — matches reference photo ────────────────────
  if (fourColorDeck) {
    const bgColor   = SUIT_BG[card.suit];
    const radius    = Math.max(4, Math.round(width * 0.10));
    const smRank    = Math.max(8,  Math.round(height * 0.135));  // small corner rank
    const smSuit    = Math.max(7,  Math.round(height * 0.110));  // small corner suit
    const lgSuit    = Math.max(16, Math.round(height * 0.300));  // large center suit
    const lgRank    = Math.max(18, Math.round(height * 0.370));  // large bottom rank

    return (
      <div
        style={{ width, height, backgroundColor: bgColor, borderRadius: radius }}
        className="shadow-md select-none relative overflow-hidden border border-white/15"
      >
        {/* Top-left: small rank + small suit stacked */}
        <div style={{
          position: 'absolute', top: '5%', left: '8%',
          color: '#ffffff', lineHeight: 1,
        }}>
          <div style={{ fontSize: smRank, fontWeight: 900, lineHeight: 1.15 }}>{card.rank}</div>
          <div style={{ fontSize: smSuit, fontWeight: 900, lineHeight: 1.0  }}>{symbol}</div>
        </div>

        {/* Center: large suit symbol */}
        <div style={{
          position: 'absolute',
          top: '42%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: lgSuit,
          color: '#ffffff', fontWeight: 900, lineHeight: 1,
          userSelect: 'none',
        }}>
          {symbol}
        </div>

        {/* Bottom-center: large rank number */}
        <div style={{
          position: 'absolute',
          bottom: '5%', left: '50%',
          transform: 'translateX(-50%)',
          fontSize: lgRank,
          color: '#ffffff', fontWeight: 900, lineHeight: 1,
          userSelect: 'none',
        }}>
          {card.rank}
        </div>
      </div>
    );
  }

  // ── Classic white deck (unchanged) ───────────────────────────────────────
  const inkColor    = CLASSIC_INK[card.suit];
  const rankSize    = Math.round(height * 0.13);
  const suitSize    = Math.round(height * 0.11);

  return (
    <div
      style={{ width, height, backgroundColor: '#ffffff', color: inkColor }}
      className="rounded-lg shadow-md select-none relative overflow-hidden border border-gray-300"
    >
      {/* Top-left corner */}
      <div className="absolute top-0.5 left-1 leading-none">
        <div className="font-black leading-tight" style={{ fontSize: rankSize }}>{card.rank}</div>
        <div className="font-black leading-tight" style={{ fontSize: suitSize }}>{symbol}</div>
      </div>

      {/* Top-right corner — 4-corner mode */}
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

      {/* Bottom-left corner — 4-corner mode */}
      {!twoCornerDeck && (
        <div className="absolute bottom-0.5 left-1 leading-none">
          <div className="font-black leading-tight" style={{ fontSize: rankSize }}>{card.rank}</div>
          <div className="font-black leading-tight" style={{ fontSize: suitSize }}>{symbol}</div>
        </div>
      )}

      {/* Bottom-right corner */}
      <div className="absolute bottom-0.5 right-1 leading-none">
        <div className="font-black leading-tight" style={{ fontSize: rankSize }}>{card.rank}</div>
        <div className="font-black leading-tight" style={{ fontSize: suitSize }}>{symbol}</div>
      </div>
    </div>
  );
}
