import type { Card } from '@poker5o/shared';
import { PlayingCard } from './PlayingCard.js';

interface Props {
  card: Card | null;
  isMyTurn: boolean;
  canDraw: boolean;
  onDraw: () => void;
  cardW: number;
  cardH: number;
}

export function DrawnCard({ card, isMyTurn, canDraw, onDraw, cardW, cardH }: Props) {
  if (!isMyTurn) {
    return (
      <div className="flex flex-col items-center gap-1 text-white/40">
        <div
          className="rounded-lg border-2 border-dashed border-white/15 flex items-center justify-center"
          style={{ width: cardW, height: cardH }}
        >
          <span className="text-xl">⏳</span>
        </div>
        <span className="text-xs">Opponent's turn</span>
      </div>
    );
  }

  if (card) {
    return (
      <div className="flex flex-col items-center gap-1">
        <PlayingCard card={card} width={cardW} height={cardH} />
        <span className="text-xs text-gold font-medium">Place in a column</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={onDraw}
        disabled={!canDraw}
        style={{
          width: cardW,
          height: cardH,
          background: `
            repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 0, transparent 50%),
            repeating-linear-gradient(-45deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 0, transparent 50%),
            linear-gradient(135deg, #1e3a8a, #1e40af)
          `,
          backgroundSize: '10px 10px, 10px 10px, 100% 100%',
        }}
        className="rounded-lg border-2 border-blue-600 hover:border-gold transition-colors duration-200
          flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
      >
        <span className="text-white/60 font-bold text-lg">Draw</span>
      </button>
      <span className="text-xs text-gold font-medium">Draw</span>
    </div>
  );
}
