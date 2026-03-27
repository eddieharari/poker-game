/**
 * /cards — Preview all 52 cards in the colored deck style.
 * Not linked from the main nav; open it manually at /cards.
 */
import { PlayingCard } from '../components/game/PlayingCard.js';
import { usePreferencesStore } from '../store/preferencesStore.js';
import type { Card, Rank, Suit } from '@poker5o/shared';

const RANKS: Rank[] = ['A','K','Q','J','10','9','8','7','6','5','4','3','2'];
const SUITS: { suit: Suit; label: string; color: string }[] = [
  { suit: 'spades',   label: 'Spades ♠',   color: '#1a1a2e' },
  { suit: 'hearts',   label: 'Hearts ♥',   color: '#8b1a1a' },
  { suit: 'diamonds', label: 'Diamonds ♦', color: '#1a3a8f' },
  { suit: 'clubs',    label: 'Clubs ♣',    color: '#1e5631' },
];

const W = 72;
const H = 100;

export function CardPreviewPage() {
  const { fourColorDeck, setFourColorDeck } = usePreferencesStore();

  return (
    <div className="min-h-screen bg-[#1a1033] p-6 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black text-white tracking-wide">Card Preview</h1>
        <label className="flex items-center gap-3 cursor-pointer">
          <span className="text-white/70 text-sm font-semibold">
            {fourColorDeck ? 'Colored deck' : 'Classic deck'}
          </span>
          <div
            onClick={() => setFourColorDeck(!fourColorDeck)}
            className={`w-12 h-6 rounded-full transition-colors relative ${fourColorDeck ? 'bg-green-500' : 'bg-gray-600'}`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${fourColorDeck ? 'translate-x-7' : 'translate-x-1'}`} />
          </div>
        </label>
      </div>

      {/* Grid: one row per suit */}
      <div className="space-y-6">
        {SUITS.map(({ suit, label, color }) => (
          <div key={suit}>
            <h2 className="text-sm font-bold uppercase tracking-widest mb-3"
              style={{ color: fourColorDeck ? color : '#ffffff99' }}>
              {label}
            </h2>
            <div className="flex flex-wrap gap-2">
              {RANKS.map(rank => {
                const card: Card = { rank, suit };
                return (
                  <div key={rank} className="flex flex-col items-center gap-1">
                    <PlayingCard card={card} width={W} height={H} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Face-down example */}
      <div className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-3">Face-down</h2>
        <PlayingCard card={{ rank: 'A', suit: 'spades', faceDown: true }} width={W} height={H} />
      </div>
    </div>
  );
}
