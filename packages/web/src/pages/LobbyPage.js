import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore.js';
import { useLobbyStore } from '../store/lobbyStore.js';
import { useSocketEvents } from '../hooks/useSocketEvents.js';
import { getSocket } from '../socket.js';
import { STAKE_OPTIONS } from '@poker5o/shared';
export function LobbyPage() {
    const { profile, signOut } = useAuthStore();
    const { players, incomingChallenge, setIncomingChallenge } = useLobbyStore();
    const [challengeTarget, setChallengeTarget] = useState(null);
    const [selectedStake, setSelectedStake] = useState(STAKE_OPTIONS[0]);
    useSocketEvents();
    useEffect(() => {
        const socket = getSocket();
        socket.emit('lobby:enter');
        return () => { socket.emit('lobby:leave'); };
    }, []);
    function sendChallenge() {
        if (!challengeTarget)
            return;
        getSocket().emit('lobby:challenge', { toPlayerId: challengeTarget.id, stake: selectedStake });
        toast(`Challenge sent to ${challengeTarget.nickname} for ${selectedStake} chips!`, { icon: '🃏' });
        setChallengeTarget(null);
    }
    function acceptChallenge() {
        if (!incomingChallenge)
            return;
        getSocket().emit('lobby:challenge:accept', { challengeId: incomingChallenge.challengeId });
        setIncomingChallenge(null);
    }
    function declineChallenge() {
        if (!incomingChallenge)
            return;
        getSocket().emit('lobby:challenge:decline', { challengeId: incomingChallenge.challengeId });
        setIncomingChallenge(null);
    }
    return (_jsxs("div", { className: "min-h-screen bg-felt-dark", children: [_jsxs("header", { className: "bg-black/30 border-b border-white/10 px-6 py-4 flex items-center justify-between", children: [_jsx("h1", { className: "font-display text-2xl text-gold", children: "Poker5O" }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("img", { src: profile?.avatar_url, alt: "me", className: "w-8 h-8 rounded-full border border-gold/50" }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold", children: profile?.nickname }), _jsxs("p", { className: "text-xs text-gold", children: [profile?.chips.toLocaleString(), " chips"] })] })] }), _jsx("button", { onClick: signOut, className: "btn-ghost text-sm px-3 py-1", children: "Sign out" })] })] }), _jsx("div", { className: "max-w-2xl mx-auto p-6 space-y-6", children: _jsxs("div", { children: [_jsxs("h2", { className: "text-white/60 text-sm font-semibold uppercase tracking-wider mb-3", children: ["Online Players (", players.length, ")"] }), players.length === 0 ? (_jsxs("div", { className: "text-center text-white/30 py-16", children: [_jsx("p", { className: "text-4xl mb-3", children: "\uD83C\uDCCF" }), _jsx("p", { children: "No other players online yet" })] })) : (_jsx("div", { className: "space-y-2", children: players.map(player => (_jsx(PlayerRow, { player: player, myChips: profile?.chips ?? 0, onChallenge: () => setChallengeTarget(player) }, player.id))) }))] }) }), challengeTarget && (_jsx(Modal, { onClose: () => setChallengeTarget(null), children: _jsxs("div", { className: "space-y-5", children: [_jsxs("h3", { className: "font-display text-2xl text-gold text-center", children: ["Challenge ", challengeTarget.nickname] }), _jsx("div", { className: "flex justify-center", children: _jsx("img", { src: challengeTarget.avatarUrl, alt: "", className: "w-16 h-16 rounded-full border-2 border-gold/40" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-white/60 mb-2 text-center", children: "Select stake" }), _jsx("div", { className: "grid grid-cols-5 gap-2", children: STAKE_OPTIONS.map(amount => (_jsx("button", { onClick: () => setSelectedStake(amount), disabled: (profile?.chips ?? 0) < amount, className: `py-2 rounded-lg text-sm font-semibold transition-all
                      ${selectedStake === amount
                                            ? 'bg-gold text-black'
                                            : 'bg-black/30 border border-white/20 hover:border-gold/50 disabled:opacity-30 disabled:cursor-not-allowed'}`, children: amount >= 1000 ? `${amount / 1000}k` : amount }, amount))) })] }), _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { onClick: () => setChallengeTarget(null), className: "btn-ghost flex-1", children: "Cancel" }), _jsx("button", { onClick: sendChallenge, className: "btn-primary flex-1", children: "Send Challenge" })] })] }) })), incomingChallenge && (_jsx(Modal, { onClose: declineChallenge, children: _jsxs("div", { className: "space-y-5 text-center", children: [_jsx("p", { className: "text-white/60 text-sm", children: "Incoming challenge!" }), _jsx("div", { className: "flex justify-center", children: _jsx("img", { src: incomingChallenge.from.avatarUrl, alt: "", className: "w-16 h-16 rounded-full border-2 border-gold/40" }) }), _jsx("h3", { className: "font-display text-2xl text-gold", children: incomingChallenge.from.nickname }), _jsxs("div", { className: "bg-black/30 rounded-xl py-4", children: [_jsx("p", { className: "text-white/50 text-sm", children: "Stake" }), _jsx("p", { className: "text-3xl font-bold text-gold", children: incomingChallenge.stake.toLocaleString() }), _jsx("p", { className: "text-white/50 text-sm", children: "chips" })] }), (profile?.chips ?? 0) < incomingChallenge.stake ? (_jsx("p", { className: "text-red-400 text-sm", children: "You don't have enough chips to accept" })) : null, _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { onClick: declineChallenge, className: "btn-danger flex-1", children: "Decline" }), _jsx("button", { onClick: acceptChallenge, disabled: (profile?.chips ?? 0) < incomingChallenge.stake, className: "btn-primary flex-1", children: "Accept" })] })] }) }))] }));
}
function PlayerRow({ player, myChips, onChallenge }) {
    const statusColor = {
        idle: 'bg-green-500',
        'in-game': 'bg-yellow-500',
        invited: 'bg-blue-500',
    }[player.status];
    const statusLabel = {
        idle: 'Online',
        'in-game': 'In Game',
        invited: 'In a challenge',
    }[player.status];
    return (_jsxs("div", { className: "flex items-center gap-3 bg-black/20 rounded-xl px-4 py-3 border border-white/5", children: [_jsxs("div", { className: "relative", children: [_jsx("img", { src: player.avatarUrl, alt: player.nickname, className: "w-10 h-10 rounded-full border border-white/20 object-cover" }), _jsx("span", { className: `absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-felt-dark ${statusColor}` })] }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "font-semibold truncate", children: player.nickname }), _jsx("p", { className: "text-xs text-white/40", children: statusLabel })] }), _jsx("button", { onClick: onChallenge, disabled: player.status !== 'idle' || myChips < 10, className: "btn-primary text-sm px-3 py-1 disabled:opacity-30 disabled:cursor-not-allowed", children: "Challenge" })] }));
}
function Modal({ children, onClose }) {
    return (_jsx("div", { className: "fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4", onClick: onClose, children: _jsx("div", { className: "bg-felt border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-slide-up", onClick: e => e.stopPropagation(), children: children }) }));
}
