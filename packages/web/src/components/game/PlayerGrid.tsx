import type { Player, Card } from '@poker5o/shared';
import { evaluateHand } from '@poker5o/shared';
import { PlayingCard } from './PlayingCard.js';

// ─── Partial hand label (1–5 face-up cards) ───────────────────────────────────

function getHandLabel(cards: Card[]): string | null {
  if (cards.length === 0) return null;
  if (cards.length === 5) return evaluateHand(cards).label;

  const rankCounts = new Map<string, number>();
  const suitCounts = new Map<string, number>();
  for (const c of cards) {
    rankCounts.set(c.rank, (rankCounts.get(c.rank) ?? 0) + 1);
    suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1);
  }
  const maxRank = Math.max(...rankCounts.values());
  const maxSuit = Math.max(...suitCounts.values());
  const pairs = [...rankCounts.values()].filter(v => v === 2).length;

  if (maxRank === 4) return 'Four of a Kind';
  if (maxRank === 3 && pairs === 1) return 'Full House Draw';
  if (maxRank === 3) return 'Three of a Kind';
  if (pairs === 2) return 'Two Pair';
  if (maxRank === 2) return 'Pair';
  if (maxSuit === cards.length && cards.length >= 3) return 'Flush Draw';
  return null;
}

interface Props {
  player: Player;
  isMe: boolean;
  currentRow: number;
  drawnCard: Card | null;
  isMyTurn: boolean;
  phase: string;
  onPlaceCard: (columnIndex: number) => void;
  avatarUrl?: string;
  cardW: number;
  cardH: number;
  revealAll?: boolean;
}

export function PlayerGrid({ player, isMe, currentRow, drawnCard, isMyTurn, phase, onPlaceCard, avatarUrl, cardW, cardH, revealAll = false }: Props) {
  const peek  = Math.floor(cardH / 3);
  const colH  = cardH + 4 * peek;
  const canPlace = isMe && isMyTurn && !!drawnCard && phase !== 'GAME_OVER';

  function cardTop(rowIdx: number): number {
    return isMe ? rowIdx * peek : (4 - rowIdx) * peek;
  }

  const columns = Array.from({ length: 5 }, (_, colIdx) => {
    const col = player.columns[colIdx] ?? [];
    const isDropTarget = canPlace && col.length === currentRow;
    const faceUp = col.filter(c => !c.faceDown);
    const handLabel = isMe ? getHandLabel(faceUp) : (faceUp.length === 5 ? evaluateHand(faceUp).label : null);
    return { colIdx, col, isDropTarget, handLabel };
  });

  return (
    <div className="flex flex-col gap-1 px-1 py-0.5">
      {/* Player header */}
      <div className={`flex items-center gap-2 ${isMe ? '' : 'flex-row-reverse justify-end'}`}>
        {avatarUrl && (
          <img src={avatarUrl} alt={player.name}
            className="w-6 h-6 rounded-full object-cover"
            style={{ border: '1px solid rgba(69,243,255,0.5)' }} />
        )}
        <span className="text-sm font-semibold text-white/80">{player.name}</span>
        {isMyTurn && phase !== 'GAME_OVER' && (
          <span className="text-xs px-2 py-0.5 rounded-full font-bold"
            style={{ background: 'rgba(69,243,255,0.15)', color: '#45F3FF', border: '1px solid rgba(69,243,255,0.3)' }}>
            Your turn
          </span>
        )}
      </div>

      {/* 5 columns — tighter gap */}
      <div className="flex justify-center gap-2 w-full">
        {columns.map(({ colIdx, col, isDropTarget, handLabel }) => (
          <div key={colIdx} className="flex flex-col items-center gap-0.5">
            {/* Hand label (above for me) */}
            {isMe && (
              <div className="h-4 flex items-center justify-center">
                {handLabel && (
                  <span className="text-[10px] font-semibold whitespace-nowrap leading-none"
                    style={{ color: '#45F3FF' }}>{handLabel}</span>
                )}
              </div>
            )}

            {/* Column */}
            <div
              className={`relative ${isDropTarget ? 'cursor-pointer' : ''}`}
              style={{ width: cardW, height: colH }}
              onClick={() => isDropTarget && onPlaceCard(colIdx)}
            >
              {/* Empty placeholder */}
              {col.length === 0 && (
                <div
                  className="absolute rounded-lg border border-dashed"
                  style={{ width: cardW, height: cardH, top: isMe ? 0 : 4 * peek, zIndex: 0, borderColor: 'rgba(255,255,255,0.1)' }}
                />
              )}

              {/* Stacked cards */}
              {col.map((card, rowIdx) => {
                const displayCard = revealAll
                  ? { ...card, faceDown: card.faceDown ?? false }
                  : (!isMe && rowIdx === 4)
                    ? { ...card, faceDown: true }
                    : { ...card, faceDown: false };
                return (
                  <div key={rowIdx} className="absolute" style={{ top: cardTop(rowIdx), zIndex: rowIdx + 1 }}>
                    <PlayingCard card={displayCard} width={cardW} height={cardH} hideFlippedCorners={!isMe} />
                  </div>
                );
              })}

              {/* Drop target */}
              {isDropTarget && (
                <div
                  className="absolute rounded-lg border-2 border-dashed flex items-center justify-center animate-pulse"
                  style={{
                    top: col.length * peek, width: cardW, height: cardH, zIndex: col.length + 1,
                    borderColor: '#45F3FF',
                    background: 'rgba(69,243,255,0.08)',
                    boxShadow: '0 0 12px rgba(69,243,255,0.2)',
                  }}
                >
                  <span className="text-xl font-bold" style={{ color: '#45F3FF' }}>+</span>
                </div>
              )}
            </div>

            {/* Hand label (below for opponent) */}
            {!isMe && (
              <div className="h-4 flex items-center justify-center">
                {handLabel && (
                  <span className="text-[10px] font-semibold whitespace-nowrap leading-none text-gray-500">{handLabel}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
