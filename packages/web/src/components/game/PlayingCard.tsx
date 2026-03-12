import type { Card } from '@poker5o/shared';

const SUIT_SYMBOL: Record<string, string> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};
const SUIT_COLOR: Record<string, string> = {
  spades: 'text-white', hearts: 'text-red-500', diamonds: 'text-red-500', clubs: 'text-white',
};

interface Props {
  card: Card;
  small?: boolean;
}

export function PlayingCard({ card, small = false }: Props) {
  if (card.faceDown) {
    return (
      <div className={`${small ? 'text-xs' : 'text-sm'} w-full h-full rounded-lg
        bg-gradient-to-br from-blue-900 to-blue-800 border border-blue-700
        flex items-center justify-center`}>
        <span className="text-blue-600 text-2xl select-none">🂠</span>
      </div>
    );
  }

  const suitColor = SUIT_COLOR[card.suit];
  const symbol    = SUIT_SYMBOL[card.suit];

  return (
    <div className={`w-full h-full rounded-lg bg-white border border-gray-200
      flex flex-col justify-between shadow-card select-none
      ${small ? 'p-0.5' : 'p-1'}`}>
      {/* Top-left rank + suit */}
      <div className={`${suitColor} ${small ? 'text-xs' : 'text-sm'} font-bold leading-none`}>
        <div>{card.rank}</div>
        <div>{symbol}</div>
      </div>
      {/* Center suit */}
      <div className={`${suitColor} ${small ? 'text-base' : 'text-xl'} text-center font-bold`}>
        {symbol}
      </div>
      {/* Bottom-right rank + suit (rotated) */}
      <div className={`${suitColor} ${small ? 'text-xs' : 'text-sm'} font-bold leading-none rotate-180 self-end`}>
        <div>{card.rank}</div>
        <div>{symbol}</div>
      </div>
    </div>
  );
}
