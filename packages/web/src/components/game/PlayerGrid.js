import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { evaluateHand } from '@poker5o/shared';
import { PlayingCard } from './PlayingCard.js';
export function PlayerGrid({ player, isMe, currentRow, drawnCard, isMyTurn, phase, onPlaceCard, avatarUrl, cardW, cardH, revealAll = false }) {
    const peek = Math.floor(cardH / 3);
    const colH = cardH + 4 * peek;
    const canPlace = isMe && isMyTurn && !!drawnCard && phase !== 'GAME_OVER';
    // Opponent: row 0 at bottom (closest to center), row 4 at top
    // Me: row 0 at top (closest to center), row 4 at bottom
    function cardTop(rowIdx) {
        return isMe ? rowIdx * peek : (4 - rowIdx) * peek;
    }
    const columns = Array.from({ length: 5 }, (_, colIdx) => {
        const col = player.columns[colIdx] ?? [];
        const isDropTarget = canPlace && col.length === currentRow;
        const faceUp = col.filter(c => !c.faceDown);
        const handLabel = faceUp.length === 5 ? evaluateHand(faceUp).label : null;
        return { colIdx, col, isDropTarget, handLabel };
    });
    return (_jsxs("div", { className: "flex flex-col gap-1", children: [_jsxs("div", { className: `flex items-center gap-2 px-1 ${isMe ? '' : 'flex-row-reverse justify-end'}`, children: [avatarUrl && (_jsx("img", { src: avatarUrl, alt: player.name, className: "w-6 h-6 rounded-full border border-white/30 object-cover" })), _jsx("span", { className: "text-sm font-semibold text-white", children: player.name }), isMyTurn && phase !== 'GAME_OVER' && (_jsx("span", { className: "text-xs bg-gold text-black px-2 py-0.5 rounded-full font-bold", children: "Your turn" }))] }), _jsx("div", { className: "flex justify-around w-full", children: columns.map(({ colIdx, col, isDropTarget, handLabel }) => (_jsxs("div", { className: "flex flex-col items-center gap-0.5", children: [isMe && (_jsx("div", { className: "h-4 flex items-center justify-center", children: handLabel && (_jsx("span", { className: "text-xs text-gold font-semibold whitespace-nowrap leading-none", children: handLabel })) })), _jsxs("div", { className: `relative ${isDropTarget ? 'cursor-pointer' : ''}`, style: { width: cardW, height: colH }, onClick: () => isDropTarget && onPlaceCard(colIdx), children: [col.length === 0 && (_jsx("div", { className: "absolute rounded-lg border border-dashed border-white/15", style: { width: cardW, height: cardH, top: isMe ? 0 : 4 * peek, zIndex: 0 } })), col.map((card, rowIdx) => {
                                    const displayCard = (!revealAll && !isMe && rowIdx === 4) ? { ...card, faceDown: true } : { ...card, faceDown: false };
                                    return (_jsx("div", { className: "absolute", style: { top: cardTop(rowIdx), zIndex: rowIdx + 1 }, children: _jsx(PlayingCard, { card: displayCard, width: cardW, height: cardH }) }, rowIdx));
                                }), isDropTarget && (_jsx("div", { className: "absolute rounded-lg border-2 border-dashed border-gold bg-gold/10 flex items-center justify-center animate-pulse", style: { top: col.length * peek, width: cardW, height: cardH, zIndex: col.length + 1 }, children: _jsx("span", { className: "text-gold text-xl font-bold", children: "+" }) }))] }), !isMe && (_jsx("div", { className: "h-4 flex items-center justify-center", children: handLabel && (_jsx("span", { className: "text-xs text-gold font-semibold whitespace-nowrap leading-none", children: handLabel })) }))] }, colIdx))) })] }));
}
