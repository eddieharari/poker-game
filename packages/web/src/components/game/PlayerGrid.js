import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { evaluatePartialHand, evaluateHand } from '@poker5o/shared';
import { PlayingCard } from './PlayingCard.js';
const ROWS = 5;
const COLS = 5;
export function PlayerGrid({ player, isMe, currentRow, drawnCard, isMyTurn, phase, onPlaceCard }) {
    const canPlace = isMe && isMyTurn && !!drawnCard && phase !== 'GAME_OVER';
    return (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: `flex items-center gap-2 ${isMe ? 'justify-start' : 'justify-end'}`, children: [_jsx("img", { src: "#", alt: player.name, className: "w-7 h-7 rounded-full border border-white/30 bg-white/10" }), _jsx("span", { className: "font-semibold text-sm", children: player.name }), isMyTurn && phase !== 'GAME_OVER' && (_jsx("span", { className: "text-xs bg-gold text-black px-2 py-0.5 rounded-full font-bold", children: "Your turn" }))] }), _jsx("div", { className: "grid grid-cols-5 gap-1.5", children: Array.from({ length: COLS }, (_, colIdx) => {
                    const col = player.columns[colIdx] ?? [];
                    const handLabel = getColumnLabel(col);
                    const isValidDrop = canPlace && col.length === currentRow;
                    return (_jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "h-5 flex items-center justify-center", children: handLabel && (_jsx("span", { className: "text-xs text-gold/80 font-medium truncate", children: handLabel })) }), Array.from({ length: ROWS }, (_, rowIdx) => {
                                const card = col[rowIdx];
                                return (_jsx("div", { onClick: () => isValidDrop && rowIdx === currentRow && onPlaceCard(colIdx), className: `card-slot w-full
                      ${isValidDrop && rowIdx === currentRow ? 'card-slot-valid' : ''}
                      ${card ? 'border-white/20' : ''}`, style: { height: '4.2rem' }, children: card ? (_jsx(PlayingCard, { card: card })) : isValidDrop && rowIdx === currentRow ? (_jsx("span", { className: "text-gold/60 text-xl", children: "+" })) : null }, rowIdx));
                            })] }, colIdx));
                }) })] }));
}
function getColumnLabel(col) {
    if (col.length === 0)
        return null;
    const visible = col.filter(c => !c.faceDown);
    if (visible.length === 5)
        return evaluateHand(visible).label;
    if (visible.length >= 1)
        return evaluatePartialHand(visible) > 0 ? '…' : null;
    return null;
}
