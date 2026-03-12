import type { Card } from '@poker5o/shared';
import { PlayingCard } from './PlayingCard.js';

interface Props {
  card: Card | null;
  isMyTurn: boolean;
  canDraw: boolean;
  onDraw: () => void;
}

export function DrawnCard({ card, isMyTurn, canDraw, onDraw }: Props) {
  if (!isMyTurn) {
    return (
      <div className="flex flex-col items-center gap-2 text-white/40">
        <div className="w-14 h-20 rounded-lg border-2 border-dashed border-white/10 flex items-center justify-center">
          <span className="text-2xl">⏳</span>
        </div>
        <span className="text-xs">Opponent's turn</span>
      </div>
    );
  }

  if (card) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="w-14 h-20">
          <PlayingCard card={card} />
        </div>
        <span className="text-xs text-gold">Click a column to place</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onDraw}
        disabled={!canDraw}
        className="w-14 h-20 rounded-lg bg-gradient-to-br from-blue-900 to-blue-800
          border-2 border-blue-600 hover:border-gold transition-colors duration-200
          flex items-center justify-center text-white/60 hover:text-gold
          disabled:opacity-40 disabled:cursor-not-allowed animate-pulse-gold"
      >
        <span className="text-2xl">🂠</span>
      </button>
      <span className="text-xs text-gold">Draw card</span>
    </div>
  );
}
