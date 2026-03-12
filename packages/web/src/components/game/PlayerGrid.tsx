import type { Player, Card } from '@poker5o/shared';
import { evaluatePartialHand, evaluateHand } from '@poker5o/shared';
import { PlayingCard } from './PlayingCard.js';

const ROWS = 5;
const COLS = 5;

interface Props {
  player: Player;
  isMe: boolean;
  currentRow: number;
  drawnCard: Card | null;
  isMyTurn: boolean;
  phase: string;
  onPlaceCard: (columnIndex: number) => void;
}

export function PlayerGrid({ player, isMe, currentRow, drawnCard, isMyTurn, phase, onPlaceCard }: Props) {
  const canPlace = isMe && isMyTurn && !!drawnCard && phase !== 'GAME_OVER';

  return (
    <div className="space-y-2">
      {/* Player label */}
      <div className={`flex items-center gap-2 ${isMe ? 'justify-start' : 'justify-end'}`}>
        <img src="#" alt={player.name} className="w-7 h-7 rounded-full border border-white/30 bg-white/10" />
        <span className="font-semibold text-sm">{player.name}</span>
        {isMyTurn && phase !== 'GAME_OVER' && (
          <span className="text-xs bg-gold text-black px-2 py-0.5 rounded-full font-bold">Your turn</span>
        )}
      </div>

      {/* Grid: 5 columns */}
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: COLS }, (_, colIdx) => {
          const col = player.columns[colIdx] ?? [];
          const handLabel = getColumnLabel(col);
          const isValidDrop = canPlace && col.length === currentRow;

          return (
            <div key={colIdx} className="space-y-1">
              {/* Hand label */}
              <div className="h-5 flex items-center justify-center">
                {handLabel && (
                  <span className="text-xs text-gold/80 font-medium truncate">{handLabel}</span>
                )}
              </div>

              {/* 5 card slots */}
              {Array.from({ length: ROWS }, (_, rowIdx) => {
                const card = col[rowIdx];
                return (
                  <div
                    key={rowIdx}
                    onClick={() => isValidDrop && rowIdx === currentRow && onPlaceCard(colIdx)}
                    className={`card-slot w-full
                      ${isValidDrop && rowIdx === currentRow ? 'card-slot-valid' : ''}
                      ${card ? 'border-white/20' : ''}`}
                    style={{ height: '4.2rem' }}
                  >
                    {card ? (
                      <PlayingCard card={card} />
                    ) : isValidDrop && rowIdx === currentRow ? (
                      <span className="text-gold/60 text-xl">+</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getColumnLabel(col: Card[]): string | null {
  if (col.length === 0) return null;
  const visible = col.filter(c => !c.faceDown);
  if (visible.length === 5) return evaluateHand(visible).label;
  if (visible.length >= 1) return evaluatePartialHand(visible) > 0 ? '…' : null;
  return null;
}
