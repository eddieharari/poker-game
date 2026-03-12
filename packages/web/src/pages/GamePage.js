import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore.js';
import { useAuthStore } from '../store/authStore.js';
import { useSocketEvents } from '../hooks/useSocketEvents.js';
import { getSocket } from '../socket.js';
import { canDrawCard } from '@poker5o/shared';
import { PlayerGrid } from '../components/game/PlayerGrid.js';
import { DrawnCard } from '../components/game/DrawnCard.js';
import { ScoreScreen } from '../components/game/ScoreScreen.js';
export function GamePage() {
    const { roomId } = useParams();
    const { profile } = useAuthStore();
    const { gameState, score, playerIndex, opponentDisconnected } = useGameStore();
    useSocketEvents();
    useEffect(() => {
        if (!roomId)
            return;
        const socket = getSocket();
        // Try to join; server sends back room:joined + game:state
        socket.emit('room:join', { roomId });
        return () => { };
    }, [roomId]);
    if (!roomId || !profile)
        return _jsx(Navigate, { to: "/lobby", replace: true });
    // Still waiting for server to confirm join
    if (playerIndex === null || !gameState) {
        return (_jsx("div", { className: "min-h-screen bg-felt-dark flex items-center justify-center", children: _jsxs("div", { className: "text-center space-y-3", children: [_jsx("div", { className: "text-5xl animate-bounce", children: "\uD83C\uDCCF" }), _jsx("p", { className: "text-white/50", children: "Connecting to game\u2026" })] }) }));
    }
    if (score)
        return _jsx(ScoreScreen, { score: score, state: gameState, playerIndex: playerIndex });
    const myPlayer = gameState.players[playerIndex];
    const themPlayer = gameState.players[playerIndex === 0 ? 1 : 0];
    const isMyTurn = gameState.currentPlayerIndex === playerIndex;
    const myPlayerId = profile.id;
    const drawAllowed = canDrawCard(gameState, myPlayerId);
    function handleDraw() {
        if (!roomId)
            return;
        getSocket().emit('action:draw', { roomId });
    }
    function handlePlace(columnIndex) {
        if (!roomId)
            return;
        getSocket().emit('action:place', { roomId, columnIndex });
    }
    const phaseLabel = {
        SETUP_PHASE: 'Setup — place one card per column',
        MAIN_PHASE: `Row ${gameState.currentRow + 1} of 5`,
        GAME_OVER: 'Game Over',
    };
    return (_jsxs("div", { className: "min-h-screen bg-felt-dark flex flex-col", children: [_jsxs("header", { className: "bg-black/30 border-b border-white/10 px-4 py-2 flex items-center justify-between", children: [_jsx("h1", { className: "font-display text-xl text-gold", children: "Poker5O" }), _jsx("span", { className: "text-sm text-white/50", children: phaseLabel[gameState.phase] ?? '' }), opponentDisconnected && (_jsx("span", { className: "text-xs text-yellow-400 animate-pulse", children: "\u26A0 Opponent disconnected" }))] }), _jsxs("div", { className: "flex-1 flex flex-col gap-4 p-4 overflow-auto", children: [_jsx(PlayerGrid, { player: themPlayer, isMe: false, currentRow: gameState.currentRow, drawnCard: null, isMyTurn: !isMyTurn, phase: gameState.phase, onPlaceCard: () => { } }), _jsx("div", { className: "flex items-center justify-center py-4", children: _jsxs("div", { className: "flex items-center gap-6", children: [_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "w-14 h-20 rounded-lg bg-gradient-to-br from-blue-950 to-blue-900\n                border border-blue-800 flex items-center justify-center", children: _jsx("span", { className: "text-white/60 font-bold text-sm", children: gameState.deck.length }) }), _jsx("p", { className: "text-xs text-white/30 mt-1", children: "Deck" })] }), _jsx(DrawnCard, { card: isMyTurn ? gameState.drawnCard : null, isMyTurn: isMyTurn, canDraw: drawAllowed, onDraw: handleDraw })] }) }), _jsx(PlayerGrid, { player: myPlayer, isMe: true, currentRow: gameState.currentRow, drawnCard: gameState.drawnCard, isMyTurn: isMyTurn, phase: gameState.phase, onPlaceCard: handlePlace })] })] }));
}
