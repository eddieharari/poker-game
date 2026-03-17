import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { usePreferencesStore } from '../../store/preferencesStore.js';
const SUIT_SYMBOL = {
    spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};
const FOUR_COLOR_BG = {
    spades: '#111827',
    clubs: '#16a34a',
    diamonds: '#2563eb',
    hearts: '#dc2626',
};
const CLASSIC_INK = {
    spades: '#111827',
    clubs: '#111827',
    diamonds: '#dc2626',
    hearts: '#dc2626',
};
export function PlayingCard({ card, width = 56, height = 84 }) {
    const fourColorDeck = usePreferencesStore(s => s.fourColorDeck);
    if (card.faceDown) {
        return (_jsx("div", { style: {
                width,
                height,
                background: `
            repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 0, transparent 50%),
            repeating-linear-gradient(-45deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 0, transparent 50%),
            linear-gradient(135deg, #1e3a8a, #1e40af)
          `,
                backgroundSize: '10px 10px, 10px 10px, 100% 100%',
            }, className: "rounded-lg border border-blue-700 shadow-md" }));
    }
    const symbol = SUIT_SYMBOL[card.suit];
    const bgColor = fourColorDeck ? FOUR_COLOR_BG[card.suit] : '#ffffff';
    const inkColor = fourColorDeck ? '#ffffff' : CLASSIC_INK[card.suit];
    const borderClass = fourColorDeck ? 'border border-white/20' : 'border border-gray-300';
    return (_jsxs("div", { style: { width, height, backgroundColor: bgColor, color: inkColor }, className: `rounded-lg shadow-md select-none relative overflow-hidden ${borderClass}`, children: [_jsxs("div", { className: "absolute top-0.5 left-1 leading-none", children: [_jsx("div", { className: "font-black leading-tight", style: { fontSize: Math.round(height * 0.13) }, children: card.rank }), _jsx("div", { className: "font-black leading-tight", style: { fontSize: Math.round(height * 0.11) }, children: symbol })] }), _jsxs("div", { className: "absolute top-0.5 right-1 leading-none", children: [_jsx("div", { className: "font-black leading-tight", style: { fontSize: Math.round(height * 0.13) }, children: card.rank }), _jsx("div", { className: "font-black leading-tight", style: { fontSize: Math.round(height * 0.11) }, children: symbol })] }), _jsx("div", { className: "absolute inset-0 flex items-center justify-center pointer-events-none", children: _jsx("span", { style: { fontSize: height * 0.28 }, children: symbol }) }), _jsxs("div", { className: "absolute bottom-0.5 left-1 leading-none rotate-180", children: [_jsx("div", { className: "font-black leading-tight", style: { fontSize: Math.round(height * 0.13) }, children: card.rank }), _jsx("div", { className: "font-black leading-tight", style: { fontSize: Math.round(height * 0.11) }, children: symbol })] }), _jsxs("div", { className: "absolute bottom-0.5 right-1 leading-none rotate-180", children: [_jsx("div", { className: "font-black leading-tight", style: { fontSize: Math.round(height * 0.13) }, children: card.rank }), _jsx("div", { className: "font-black leading-tight", style: { fontSize: Math.round(height * 0.11) }, children: symbol })] })] }));
}
