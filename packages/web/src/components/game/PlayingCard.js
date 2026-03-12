import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const SUIT_SYMBOL = {
    spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};
const SUIT_COLOR = {
    spades: 'text-white', hearts: 'text-red-500', diamonds: 'text-red-500', clubs: 'text-white',
};
export function PlayingCard({ card, small = false }) {
    if (card.faceDown) {
        return (_jsx("div", { className: `${small ? 'text-xs' : 'text-sm'} w-full h-full rounded-lg
        bg-gradient-to-br from-blue-900 to-blue-800 border border-blue-700
        flex items-center justify-center`, children: _jsx("span", { className: "text-blue-600 text-2xl select-none", children: "\uD83C\uDCA0" }) }));
    }
    const suitColor = SUIT_COLOR[card.suit];
    const symbol = SUIT_SYMBOL[card.suit];
    return (_jsxs("div", { className: `w-full h-full rounded-lg bg-white border border-gray-200
      flex flex-col justify-between shadow-card select-none
      ${small ? 'p-0.5' : 'p-1'}`, children: [_jsxs("div", { className: `${suitColor} ${small ? 'text-xs' : 'text-sm'} font-bold leading-none`, children: [_jsx("div", { children: card.rank }), _jsx("div", { children: symbol })] }), _jsx("div", { className: `${suitColor} ${small ? 'text-base' : 'text-xl'} text-center font-bold`, children: symbol }), _jsxs("div", { className: `${suitColor} ${small ? 'text-xs' : 'text-sm'} font-bold leading-none rotate-180 self-end`, children: [_jsx("div", { children: card.rank }), _jsx("div", { children: symbol })] })] }));
}
