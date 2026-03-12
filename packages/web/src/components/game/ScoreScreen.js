import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../store/gameStore.js';
export function ScoreScreen({ score, state, playerIndex }) {
    const navigate = useNavigate();
    const reset = useGameStore(s => s.reset);
    const me = state.players[playerIndex];
    const them = state.players[playerIndex === 0 ? 1 : 0];
    const iWon = score.winner === playerIndex;
    const isDraw = score.winner === 'draw';
    return (_jsxs("div", { className: "min-h-screen bg-felt-dark flex flex-col items-center justify-center p-6 gap-8 animate-slide-up", children: [_jsxs("div", { className: "text-center", children: [_jsx("p", { className: "text-6xl mb-3", children: isDraw ? '🤝' : iWon ? '🏆' : '😞' }), _jsx("h2", { className: "font-display text-4xl text-gold", children: isDraw ? 'Draw!' : iWon ? 'You Win!' : 'You Lose!' }), _jsxs("p", { className: "text-white/50 mt-1", children: [score.player0Wins, "\u2013", score.player1Wins, score.draws > 0 ? ` (${score.draws} tied)` : ''] })] }), _jsxs("div", { className: "w-full max-w-xl space-y-2", children: [_jsx("h3", { className: "text-white/50 text-sm font-semibold uppercase tracking-wider text-center mb-4", children: "Column Results" }), score.columnResults.map((r, i) => {
                        const myEval = r[playerIndex === 0 ? 'player0Hand' : 'player1Hand'];
                        const themEval = r[playerIndex === 0 ? 'player1Hand' : 'player0Hand'];
                        const iWonCol = r.winner === playerIndex;
                        const colDraw = r.winner === 'draw';
                        return (_jsxs("div", { className: `rounded-xl border p-3 flex items-center gap-3
                ${iWonCol ? 'border-gold/40 bg-gold/10' : colDraw ? 'border-white/10 bg-white/5' : 'border-red-900/40 bg-red-900/10'}`, children: [_jsx("span", { className: "text-2xl", children: iWonCol ? '✅' : colDraw ? '🤝' : '❌' }), _jsxs("div", { className: "flex-1 text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-white/60", children: me.name }), _jsx("span", { className: iWonCol ? 'text-gold font-semibold' : 'text-white/80', children: myEval.label })] }), _jsxs("div", { className: "flex justify-between mt-0.5", children: [_jsx("span", { className: "text-white/60", children: them.name }), _jsx("span", { className: !iWonCol && !colDraw ? 'text-gold font-semibold' : 'text-white/80', children: themEval.label })] })] })] }, i));
                    })] }), _jsx("button", { onClick: () => { reset(); navigate('/lobby'); }, className: "btn-primary px-10 py-3 text-lg", children: "Back to Lobby" })] }));
}
