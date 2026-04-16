import { useState } from 'react';

const JACKPOT_AMOUNT = 1000;

function JackpotRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="glass-panel rounded-2xl p-6 w-full max-w-sm border border-[#FFD700]/30 space-y-4"
        onClick={e => e.stopPropagation()}
        style={{ background: 'linear-gradient(135deg, rgba(26,26,46,0.98) 0%, rgba(11,12,16,0.98) 100%)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#FFD700]">Royal Flush Jackpot</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">&times;</button>
        </div>

        <div className="space-y-3 text-sm text-white/80">
          <div className="flex items-start gap-3">
            <span className="text-[#FFD700] text-lg mt-0.5">♠</span>
            <div>
              <p className="font-semibold text-white">Poker5O</p>
              <p>Make a <span className="text-[#FFD700] font-semibold">Royal Flush</span> in any column to win the jackpot.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="text-[#FFD700] text-lg mt-0.5">♥</span>
            <div>
              <p className="font-semibold text-white">PazPaz</p>
              <p>Make a <span className="text-[#FFD700] font-semibold">Royal Flush</span> in any flop <span className="text-white/60">AND</span> win all 3 flops for a complete victory.</p>
            </div>
          </div>

          <div className="border-t border-white/10 pt-3">
            <p className="text-center text-[#FFD700] font-bold text-base">
              Prize: {JACKPOT_AMOUNT.toLocaleString()} chips
            </p>
            <p className="text-center text-white/40 text-xs mt-1">
              Announced to the entire lobby when hit!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function JackpotBanner({ compact }: { compact?: boolean }) {
  const [showRules, setShowRules] = useState(false);

  if (compact) {
    return (
      <>
        <button
          onClick={() => setShowRules(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#FFD700]/30 text-[#FFD700] hover:bg-[#FFD700]/10 transition-colors"
          style={{ background: 'rgba(255,215,0,0.05)' }}
        >
          <span className="text-sm">🏆</span>
          <span className="text-[10px] font-bold tracking-wide">JACKPOT</span>
        </button>
        {showRules && <JackpotRulesModal onClose={() => setShowRules(false)} />}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowRules(true)}
        className="relative z-10 w-full flex items-center justify-center gap-2 py-2 border-b border-[#FFD700]/10 hover:bg-[#FFD700]/5 transition-colors cursor-pointer"
        style={{ background: 'linear-gradient(90deg, rgba(255,215,0,0.03) 0%, rgba(255,215,0,0.08) 50%, rgba(255,215,0,0.03) 100%)' }}
      >
        <span className="text-sm">🏆</span>
        <span className="text-xs font-bold text-[#FFD700] tracking-wide">ROYAL FLUSH JACKPOT</span>
        <span className="text-xs text-[#FFD700]/70 font-semibold">{JACKPOT_AMOUNT.toLocaleString()} chips</span>
      </button>
      {showRules && <JackpotRulesModal onClose={() => setShowRules(false)} />}
    </>
  );
}
