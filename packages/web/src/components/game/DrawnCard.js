import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { PlayingCard } from './PlayingCard.js';
export function DrawnCard({ card, isMyTurn, canDraw, onDraw, cardW, cardH }) {
    if (!isMyTurn) {
        return (_jsxs("div", { className: "flex flex-col items-center gap-1 text-white/40", children: [_jsx("div", { className: "rounded-lg border-2 border-dashed border-white/15 flex items-center justify-center", style: { width: cardW, height: cardH }, children: _jsx("span", { className: "text-xl", children: "\u23F3" }) }), _jsx("span", { className: "text-xs", children: "Opponent's turn" })] }));
    }
    if (card) {
        return (_jsxs("div", { className: "flex flex-col items-center gap-1", children: [_jsx(PlayingCard, { card: card, width: cardW, height: cardH }), _jsx("span", { className: "text-xs text-gold font-medium", children: "Place in a column" })] }));
    }
    return (_jsxs("div", { className: "flex flex-col items-center gap-1", children: [_jsx("button", { onClick: onDraw, disabled: !canDraw, style: {
                    width: cardW,
                    height: cardH,
                    background: `
            repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 0, transparent 50%),
            repeating-linear-gradient(-45deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 0, transparent 50%),
            linear-gradient(135deg, #1e3a8a, #1e40af)
          `,
                    backgroundSize: '10px 10px, 10px 10px, 100% 100%',
                }, className: "rounded-lg border-2 border-blue-600 hover:border-gold transition-colors duration-200\n          flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shadow-lg", children: _jsx("span", { className: "text-white/60 font-bold text-lg", children: "Draw" }) }), _jsx("span", { className: "text-xs text-gold font-medium", children: "Draw" })] }));
}
