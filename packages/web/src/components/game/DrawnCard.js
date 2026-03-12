import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { PlayingCard } from './PlayingCard.js';
export function DrawnCard({ card, isMyTurn, canDraw, onDraw }) {
    if (!isMyTurn) {
        return (_jsxs("div", { className: "flex flex-col items-center gap-2 text-white/40", children: [_jsx("div", { className: "w-14 h-20 rounded-lg border-2 border-dashed border-white/10 flex items-center justify-center", children: _jsx("span", { className: "text-2xl", children: "\u23F3" }) }), _jsx("span", { className: "text-xs", children: "Opponent's turn" })] }));
    }
    if (card) {
        return (_jsxs("div", { className: "flex flex-col items-center gap-2", children: [_jsx("div", { className: "w-14 h-20", children: _jsx(PlayingCard, { card: card }) }), _jsx("span", { className: "text-xs text-gold", children: "Click a column to place" })] }));
    }
    return (_jsxs("div", { className: "flex flex-col items-center gap-2", children: [_jsx("button", { onClick: onDraw, disabled: !canDraw, className: "w-14 h-20 rounded-lg bg-gradient-to-br from-blue-900 to-blue-800\n          border-2 border-blue-600 hover:border-gold transition-colors duration-200\n          flex items-center justify-center text-white/60 hover:text-gold\n          disabled:opacity-40 disabled:cursor-not-allowed animate-pulse-gold", children: _jsx("span", { className: "text-2xl", children: "\uD83C\uDCA0" }) }), _jsx("span", { className: "text-xs text-gold", children: "Draw card" })] }));
}
