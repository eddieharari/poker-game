import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../store/gameStore.js';
import { useAuthStore } from '../../store/authStore.js';
import { useCardSize } from '../../hooks/useCardSize.js';
import { PlayerGrid } from './PlayerGrid.js';
function prepareReveal(state, revealedCols) {
    return {
        ...state,
        players: state.players.map(p => ({
            ...p,
            columns: p.columns.map((col, colIdx) => col.map((card, rowIdx) => ({
                ...card,
                faceDown: rowIdx === 4 && colIdx > revealedCols,
            }))),
        })),
    };
}
export function ScoreScreen({ score, state, playerIndex }) {
    const navigate = useNavigate();
    const reset = useGameStore(s => s.reset);
    const fetchProfile = useAuthStore(s => s.fetchProfile);
    const { cardW, cardH } = useCardSize();
    const [revealedCols, setRevealedCols] = useState(-1);
    useEffect(() => {
        if (revealedCols >= 4)
            return;
        const t = setTimeout(() => setRevealedCols(c => c + 1), revealedCols === -1 ? 900 : 800);
        return () => clearTimeout(t);
    }, [revealedCols]);
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const revealed = prepareReveal(state, revealedCols);
    const me = revealed.players[playerIndex];
    const them = revealed.players[opponentIndex];
    const iWon = score.winner === playerIndex;
    const isDraw = score.winner === 'draw';
    const allRevealed = revealedCols >= 4;
    function goToLobby() {
        reset();
        const { session } = useAuthStore.getState();
        fetchProfile(session);
        navigate('/lobby');
    }
    return (_jsxs("div", { className: "h-screen bg-felt-dark flex flex-col overflow-hidden", children: [_jsxs("header", { className: "flex-shrink-0 bg-black/60 border-b border-white/10 px-4 py-2 flex items-center justify-between gap-4", children: [_jsx("h1", { className: "font-display text-lg text-gold shrink-0", children: "Poker5O" }), _jsx("div", { className: "flex items-center gap-3", children: allRevealed ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-2xl", children: isDraw ? '🤝' : iWon ? '🏆' : '😞' }), _jsx("span", { className: "font-display text-xl text-gold", children: isDraw ? 'Draw!' : iWon ? 'You Win!' : 'You Lose!' }), _jsxs("span", { className: "text-white/50 text-sm", children: [score.player0Wins, "\u2013", score.player1Wins, score.draws > 0 ? ` (${score.draws} tied)` : ''] }), score.completeWinBonus && score.isCompleteWin && (_jsx("span", { className: "text-xs font-semibold bg-gold/20 text-gold border border-gold/40 rounded-full px-2 py-0.5", children: "\uD83C\uDFC6 Complete Win \u2014 Double Payout!" }))] })) : (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-white/50 text-sm", children: "Revealing results\u2026" }), _jsx("button", { onClick: () => setRevealedCols(4), className: "btn-ghost text-xs px-2 py-1", children: "Skip reveal" })] })) }), _jsx("button", { onClick: goToLobby, className: "btn-primary px-4 py-1.5 text-sm shrink-0", children: "Back to Lobby" })] }), _jsxs("div", { className: "flex-1 flex overflow-hidden", children: [_jsxs("div", { className: "flex-1 flex flex-col items-center justify-center gap-2 py-3 px-2", children: [_jsx(PlayerGrid, { player: them, isMe: false, currentRow: state.currentRow, drawnCard: null, isMyTurn: false, phase: "GAME_OVER", onPlaceCard: () => { }, avatarUrl: state.players[opponentIndex]?.avatarUrl, cardW: cardW, cardH: cardH, revealAll: true }), _jsx("div", { className: "flex gap-3 justify-center", children: score.columnResults.map((r, i) => {
                                    if (i > revealedCols)
                                        return _jsx("div", { style: { width: cardW } }, i);
                                    const myWon = r.winner === playerIndex;
                                    const draw = r.winner === 'draw';
                                    return (_jsx("div", { style: { width: cardW }, className: "flex items-center justify-center", children: _jsx("span", { className: "text-base leading-none", children: myWon ? '✅' : draw ? '🤝' : '❌' }) }, i));
                                }) }), _jsx("div", { className: "w-full max-w-lg h-px bg-white/10 mx-auto" }), _jsx(PlayerGrid, { player: me, isMe: true, currentRow: state.currentRow, drawnCard: null, isMyTurn: false, phase: "GAME_OVER", onPlaceCard: () => { }, avatarUrl: state.players[playerIndex]?.avatarUrl, cardW: cardW, cardH: cardH, revealAll: true })] }), _jsxs("div", { className: "flex-shrink-0 flex flex-col justify-center gap-2 py-4 px-2 border-l border-white/10 bg-black/30 overflow-y-auto", style: { width: Math.max(cardW + 32, 150) }, children: [score.columnResults.map((r, i) => {
                                if (i > revealedCols) {
                                    return (_jsxs("div", { className: "rounded-lg p-2 text-xs border border-white/10 bg-white/5 opacity-40", children: [_jsxs("div", { className: "text-white/40 font-medium", children: ["Col ", i + 1] }), _jsx("div", { className: "text-white/30", children: "Revealing..." })] }, i));
                                }
                                const myEval = r[playerIndex === 0 ? 'player0Hand' : 'player1Hand'];
                                const themEval = r[playerIndex === 0 ? 'player1Hand' : 'player0Hand'];
                                const myWon = r.winner === playerIndex;
                                const draw = r.winner === 'draw';
                                return (_jsxs("div", { className: `rounded-lg p-2 text-xs border
                  ${myWon ? 'border-gold/40 bg-gold/10'
                                        : draw ? 'border-white/10 bg-white/5'
                                            : 'border-red-900/40 bg-red-900/10'}`, children: [_jsxs("div", { className: "flex items-center gap-1 mb-1", children: [_jsx("span", { className: "text-sm", children: myWon ? '✅' : draw ? '🤝' : '❌' }), _jsxs("span", { className: "text-white/40 font-medium", children: ["Col ", i + 1] })] }), _jsxs("div", { className: "text-white/70 leading-snug", children: [_jsxs("span", { className: "text-white/40", children: [me.name, ": "] }), _jsx("span", { className: myWon ? 'text-gold font-semibold' : '', children: myEval.label })] }), _jsxs("div", { className: "text-white/70 leading-snug", children: [_jsxs("span", { className: "text-white/40", children: [them.name, ": "] }), _jsx("span", { className: !myWon && !draw ? 'text-gold font-semibold' : '', children: themEval.label })] })] }, i));
                            }), allRevealed && (_jsxs("div", { className: `rounded-lg p-3 text-center border mt-2
              ${isDraw ? 'border-white/20 bg-white/10'
                                    : iWon ? 'border-gold/40 bg-gold/10'
                                        : 'border-red-900/40 bg-red-900/10'}`, children: [_jsx("div", { className: "text-2xl mb-1", children: isDraw ? '🤝' : iWon ? '🏆' : '😞' }), _jsx("div", { className: "font-display text-gold text-sm", children: isDraw ? 'Draw!' : iWon ? 'You Win!' : 'You Lose!' })] }))] })] })] }));
}
