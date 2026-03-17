import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore.js';
import { useAuthStore } from '../store/authStore.js';
import { useSocketEvents } from '../hooks/useSocketEvents.js';
import { useCardSize } from '../hooks/useCardSize.js';
import { getSocket } from '../socket.js';
import { canDrawCard } from '@poker5o/shared';
import { PlayerGrid } from '../components/game/PlayerGrid.js';
import { DrawnCard } from '../components/game/DrawnCard.js';
import { ScoreScreen } from '../components/game/ScoreScreen.js';
export function GamePage() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const { profile } = useAuthStore();
    const { gameState, score, playerIndex, opponentLeft, setOpponentLeft } = useGameStore();
    useSocketEvents();
    const { cardW, cardH } = useCardSize();
    const [confirmForfeit, setConfirmForfeit] = useState(false);
    useEffect(() => {
        if (!roomId)
            return;
        const socket = getSocket();
        socket.emit('room:join', { roomId });
        return () => { };
    }, [roomId]);
    if (!roomId || !profile)
        return _jsx(Navigate, { to: "/lobby", replace: true });
    if (playerIndex === null || !gameState) {
        return (_jsx("div", { className: "min-h-screen flex items-center justify-center", style: { backgroundImage: 'url(/bg-poker.png)', backgroundSize: 'cover', backgroundPosition: 'center' }, children: _jsxs("div", { className: "text-center space-y-3", children: [_jsx("div", { className: "text-5xl animate-bounce", children: "\uD83C\uDCCF" }), _jsx("p", { className: "text-white/50", children: "Connecting to game\u2026" })] }) }));
    }
    if (score)
        return _jsx(ScoreScreen, { score: score, state: gameState, playerIndex: playerIndex });
    const myPlayer = gameState.players[playerIndex];
    const themPlayer = gameState.players[playerIndex === 0 ? 1 : 0];
    const isMyTurn = gameState.currentPlayerIndex === playerIndex;
    const myPlayerId = profile.id;
    const drawAllowed = canDrawCard(gameState, myPlayerId);
    const opponentIndex = playerIndex === 0 ? 1 : 0;
    function handleDraw() {
        if (!roomId)
            return;
        getSocket().emit('action:draw', { roomId });
    }
    function handleForfeit() {
        if (!roomId)
            return;
        getSocket().emit('game:forfeit', { roomId });
        setConfirmForfeit(false);
    }
    function handlePlace(columnIndex) {
        if (!roomId)
            return;
        getSocket().emit('action:place', { roomId, columnIndex });
    }
    const phaseLabel = {
        SETUP_PHASE: 'Setup — dealing first row',
        MAIN_PHASE: `Row ${gameState.currentRow + 1} of 5`,
        GAME_OVER: 'Game Over',
    };
    return (_jsxs("div", { className: "h-screen flex flex-col overflow-hidden", style: {
            backgroundImage: 'url(/bg-poker.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
        }, children: [_jsxs("header", { className: "flex-shrink-0 bg-black/60 backdrop-blur-sm border-b border-white/10 px-4 py-2 flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: () => setConfirmForfeit(true), className: "text-white/50 hover:text-white transition-colors", "aria-label": "Back to lobby", children: _jsx("svg", { className: "w-5 h-5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 19l-7-7 7-7" }) }) }), _jsx("h1", { className: "font-display text-lg text-gold", children: "Poker5O" })] }), _jsx("span", { className: "text-xs text-white/50 bg-black/30 px-3 py-1 rounded-full", children: phaseLabel[gameState.phase] ?? '' }), _jsx("button", { onClick: () => setConfirmForfeit(true), className: "text-xs text-red-400/70 hover:text-red-400 border border-red-900/40 hover:border-red-500/50 px-2 py-1 rounded transition-colors", children: "Give Up" })] }), _jsxs("div", { className: "flex-1 flex flex-col overflow-hidden px-1 py-0.5", children: [_jsx(PlayerGrid, { player: themPlayer, isMe: false, currentRow: gameState.currentRow, drawnCard: null, isMyTurn: !isMyTurn, phase: gameState.phase, onPlaceCard: () => { }, avatarUrl: gameState.players[opponentIndex]?.avatarUrl, cardW: cardW, cardH: cardH }), _jsxs("div", { className: "flex-shrink-0 flex items-center justify-center gap-6 border-y border-white/10 bg-black/40", style: { height: 120 }, children: [_jsxs("div", { className: "flex flex-col items-center gap-1", children: [_jsx("div", { style: {
                                            width: 56, height: 84,
                                            background: `repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 0, transparent 50%), repeating-linear-gradient(-45deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 0, transparent 50%), linear-gradient(135deg, #1e3a8a, #1e40af)`,
                                            backgroundSize: '10px 10px, 10px 10px, 100% 100%',
                                        }, className: "rounded-lg border border-blue-700 shadow flex items-center justify-center", children: _jsx("span", { className: "text-white font-bold text-lg", children: gameState.deck.length }) }), _jsx("span", { className: "text-white/30 text-xs", children: "Deck" })] }), _jsx(DrawnCard, { card: isMyTurn ? gameState.drawnCard : null, isMyTurn: isMyTurn, canDraw: drawAllowed, onDraw: handleDraw, cardW: 56, cardH: 84 })] }), _jsx(PlayerGrid, { player: myPlayer, isMe: true, currentRow: gameState.currentRow, drawnCard: gameState.drawnCard, isMyTurn: isMyTurn, phase: gameState.phase, onPlaceCard: handlePlace, avatarUrl: profile.avatar_url, cardW: cardW, cardH: cardH })] }), opponentLeft && (_jsx("div", { className: "fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4", children: _jsxs("div", { className: "bg-felt border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4", children: [_jsxs("div", { className: "text-center space-y-2", children: [_jsx("p", { className: "text-3xl animate-pulse", children: "\uD83D\uDCE1" }), _jsx("h2", { className: "font-display text-xl text-gold", children: "Opponent Disconnected" }), _jsx("p", { className: "text-white/60 text-sm", children: "Your opponent lost connection. They have 10 minutes to reconnect before the game is abandoned." })] }), _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { onClick: () => setOpponentLeft(false), className: "btn-ghost flex-1", children: "Wait" }), _jsx("button", { onClick: () => { setOpponentLeft(false); navigate('/lobby'); }, className: "flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors", children: "Go to Lobby" })] })] }) })), confirmForfeit && (_jsx("div", { className: "fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4", children: _jsxs("div", { className: "bg-felt border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4", children: [_jsxs("div", { className: "text-center space-y-2", children: [_jsx("p", { className: "text-3xl", children: "\uD83C\uDFF3\uFE0F" }), _jsx("h2", { className: "font-display text-xl text-gold", children: "Give Up?" }), _jsx("p", { className: "text-white/60 text-sm", children: "You will forfeit the game and lose your stake. This cannot be undone." })] }), _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { onClick: () => setConfirmForfeit(false), className: "btn-ghost flex-1", children: "Cancel" }), _jsx("button", { onClick: handleForfeit, className: "flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors", children: "Yes, Give Up" })] })] }) }))] }));
}
