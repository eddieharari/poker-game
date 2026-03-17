import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore.js';
import { useLobbyStore } from '../store/lobbyStore.js';
import { useSocketEvents } from '../hooks/useSocketEvents.js';
import { getSocket } from '../socket.js';
import { STAKE_OPTIONS } from '@poker5o/shared';
export function LobbyPage() {
    const { profile, signOut } = useAuthStore();
    const navigate = useNavigate();
    const { players, incomingChallenge, setIncomingChallenge } = useLobbyStore();
    const [challengeTarget, setChallengeTarget] = useState(null);
    const [selectedStake, setSelectedStake] = useState(STAKE_OPTIONS[0]);
    const [completeWinBonus, setCompleteWinBonus] = useState(false);
    const [myStatus, setMyStatus] = useState('idle');
    function toggleStatus() {
        const next = myStatus === 'idle' ? 'busy' : 'idle';
        setMyStatus(next);
        getSocket().emit('lobby:set_status', { status: next });
    }
    useSocketEvents();
    useEffect(() => {
        const sock = getSocket();
        const enter = () => sock.emit('lobby:enter');
        sock.on('connect', enter);
        if (sock.connected)
            enter();
        return () => {
            sock.off('connect', enter);
            if (sock.connected)
                sock.emit('lobby:leave');
        };
    }, []);
    function sendChallenge() {
        if (!challengeTarget)
            return;
        getSocket().emit('lobby:challenge', { toPlayerId: challengeTarget.id, stake: selectedStake, completeWinBonus });
        const bonusNote = completeWinBonus ? ' (5-0 bonus active)' : '';
        toast(`Challenge sent to ${challengeTarget.nickname} for ${selectedStake} chips${bonusNote}!`, { icon: '🃏' });
        setChallengeTarget(null);
        setCompleteWinBonus(false);
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
    return (_jsxs("div", { className: "min-h-screen", style: {
            backgroundImage: 'url(/bg-lobby.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed',
        }, children: [_jsxs("header", { className: "bg-black/60 backdrop-blur-sm border-b border-white/10 px-6 py-4 flex items-center justify-between", children: [_jsx("h1", { className: "font-display text-2xl text-gold", children: "Poker5O" }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("div", { className: "relative", children: [_jsx("img", { src: profile?.avatar_url, alt: "me", className: "w-8 h-8 rounded-full border border-gold/50" }), _jsx("span", { className: `absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-black ${myStatus === 'busy' ? 'bg-red-500' : 'bg-green-500'}` })] }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold", children: profile?.nickname }), _jsxs("p", { className: "text-xs text-gold", children: [profile?.chips.toLocaleString(), " chips"] })] })] }), _jsx("button", { onClick: toggleStatus, className: `text-xs font-semibold px-3 py-1 rounded-full border transition-all ${myStatus === 'busy'
                                    ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30'
                                    : 'bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30'}`, children: myStatus === 'busy' ? '🔴 Busy' : '🟢 Ready' }), _jsx("button", { onClick: () => navigate('/settings'), className: "text-white/50 hover:text-gold transition-colors p-1.5 rounded-lg hover:bg-white/10", "aria-label": "Settings", children: _jsxs("svg", { className: "w-5 h-5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: [_jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 1.5, d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" }), _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 1.5, d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" })] }) }), _jsx("button", { onClick: signOut, className: "btn-ghost text-sm px-3 py-1", children: "Sign out" })] })] }), _jsx("div", { className: "max-w-2xl mx-auto p-6 space-y-6 bg-black/40 backdrop-blur-sm min-h-[calc(100vh-73px)]", children: _jsxs("div", { children: [_jsx("h2", { className: "text-white/60 text-sm font-semibold uppercase tracking-wider mb-3", children: players.length === 0
                                ? 'No other players online yet'
                                : `${players.length} other player${players.length === 1 ? '' : 's'} online` }), players.length === 0 ? (_jsxs("div", { className: "text-center text-white/30 py-16", children: [_jsx("p", { className: "text-4xl mb-3", children: "\uD83C\uDCCF" }), _jsx("p", { children: "Waiting for others to join\u2026" })] })) : (_jsx("div", { className: "space-y-2", children: players.map(player => (_jsx(PlayerRow, { player: player, myChips: profile?.chips ?? 0, onChallenge: () => setChallengeTarget(player) }, player.id))) }))] }) }), challengeTarget && (_jsx(Modal, { onClose: () => setChallengeTarget(null), children: _jsxs("div", { className: "space-y-5", children: [_jsxs("h3", { className: "font-display text-2xl text-gold text-center", children: ["Challenge ", challengeTarget.nickname] }), _jsx("div", { className: "flex justify-center", children: _jsx("img", { src: challengeTarget.avatarUrl, alt: "", className: "w-16 h-16 rounded-full border-2 border-gold/40" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-white/60 mb-2 text-center", children: "Select stake" }), _jsx("div", { className: "grid grid-cols-5 gap-2", children: STAKE_OPTIONS.map(amount => (_jsx("button", { onClick: () => setSelectedStake(amount), disabled: (profile?.chips ?? 0) < amount, className: `py-2 rounded-lg text-sm font-semibold transition-all
                      ${selectedStake === amount
                                            ? 'bg-gold text-black'
                                            : 'bg-black/30 border border-white/20 hover:border-gold/50 disabled:opacity-30 disabled:cursor-not-allowed'}`, children: amount >= 1000 ? `${amount / 1000}k` : amount }, amount))) })] }), _jsxs("label", { className: `flex items-start gap-3 rounded-xl p-3 border cursor-pointer transition-all select-none
              ${completeWinBonus ? 'border-gold/50 bg-gold/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`, children: [_jsx("input", { type: "checkbox", checked: completeWinBonus, onChange: e => setCompleteWinBonus(e.target.checked), className: "mt-0.5 accent-yellow-400 w-4 h-4 shrink-0" }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-white/90", children: "Complete Win Bonus (5-0)" }), _jsxs("p", { className: "text-xs text-white/50 mt-0.5", children: ["A 5-0 sweep doubles the payout. Both players need ", _jsxs("span", { className: "text-gold font-medium", children: [(selectedStake * 2).toLocaleString(), " chips"] }), "."] }), completeWinBonus && (profile?.chips ?? 0) < selectedStake * 2 && (_jsx("p", { className: "text-xs text-red-400 mt-1", children: "You don't have enough chips for this option." }))] })] }), _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { onClick: () => { setChallengeTarget(null); setCompleteWinBonus(false); }, className: "btn-ghost flex-1", children: "Cancel" }), _jsx("button", { onClick: sendChallenge, disabled: completeWinBonus && (profile?.chips ?? 0) < selectedStake * 2, className: "btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed", children: "Send Challenge" })] })] }) })), incomingChallenge && (_jsx(Modal, { onClose: declineChallenge, children: _jsxs("div", { className: "space-y-5 text-center", children: [_jsx("p", { className: "text-white/60 text-sm", children: "Incoming challenge!" }), _jsx("div", { className: "flex justify-center", children: _jsx("img", { src: incomingChallenge.from.avatarUrl, alt: "", className: "w-16 h-16 rounded-full border-2 border-gold/40" }) }), _jsx("h3", { className: "font-display text-2xl text-gold", children: incomingChallenge.from.nickname }), _jsxs("div", { className: "bg-black/30 rounded-xl py-4", children: [_jsx("p", { className: "text-white/50 text-sm", children: "Stake" }), _jsx("p", { className: "text-3xl font-bold text-gold", children: incomingChallenge.stake.toLocaleString() }), _jsx("p", { className: "text-white/50 text-sm", children: "chips" })] }), incomingChallenge.completeWinBonus && (_jsxs("div", { className: "flex items-center justify-center gap-2 bg-gold/10 border border-gold/30 rounded-xl px-4 py-2", children: [_jsx("span", { className: "text-lg", children: "\uD83C\uDFC6" }), _jsxs("div", { className: "text-left", children: [_jsx("p", { className: "text-sm font-semibold text-gold", children: "Complete Win Bonus Active" }), _jsxs("p", { className: "text-xs text-white/50", children: ["A 5-0 sweep pays ", _jsx("span", { className: "text-gold font-medium", children: (incomingChallenge.stake * 2).toLocaleString() }), " chips"] })] })] })), (profile?.chips ?? 0) < (incomingChallenge.completeWinBonus ? incomingChallenge.stake * 2 : incomingChallenge.stake) ? (_jsx("p", { className: "text-red-400 text-sm", children: "You don't have enough chips to accept" })) : null, _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { onClick: declineChallenge, className: "btn-danger flex-1", children: "Decline" }), _jsx("button", { onClick: acceptChallenge, disabled: (profile?.chips ?? 0) < (incomingChallenge.completeWinBonus ? incomingChallenge.stake * 2 : incomingChallenge.stake), className: "btn-primary flex-1", children: "Accept" })] })] }) }))] }));
}
const STATUS_DOT = {
    idle: 'bg-green-500',
    busy: 'bg-red-500',
    'in-game': 'bg-purple-500',
    invited: 'bg-blue-500',
};
const STATUS_BADGE = {
    busy: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Busy' },
    'in-game': { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'In Game' },
    invited: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'In Queue' },
};
function PlayerRow({ player, myChips, onChallenge }) {
    const badge = STATUS_BADGE[player.status];
    const totalGames = player.wins + player.losses + player.draws;
    const canChallenge = player.status === 'idle' && myChips >= 10;
    return (_jsxs("div", { className: "flex items-center gap-3 bg-black/20 rounded-xl px-4 py-3 border border-white/5", children: [_jsxs("div", { className: "relative", children: [_jsx("img", { src: player.avatarUrl, alt: player.nickname, className: "w-10 h-10 rounded-full border border-white/20 object-cover" }), _jsx("span", { className: `absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-felt-dark ${STATUS_DOT[player.status]}` })] }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("p", { className: "font-semibold truncate", children: player.nickname }), badge && (_jsx("span", { className: `text-xs ${badge.bg} ${badge.text} border border-current/30 rounded px-1.5 py-0.5 shrink-0 opacity-70`, children: badge.label }))] }), _jsxs("p", { className: "text-xs text-white/40", children: [totalGames.toLocaleString(), " games\u00A0\u00A0", _jsxs("span", { className: "text-green-400/70", children: ["W:", player.wins] }), "\u00A0", _jsxs("span", { className: "text-red-400/70", children: ["L:", player.losses] }), "\u00A0", _jsxs("span", { className: "text-white/30", children: ["D:", player.draws] })] })] }), _jsx("button", { onClick: onChallenge, disabled: !canChallenge, className: "btn-primary text-sm px-3 py-1 disabled:opacity-30 disabled:cursor-not-allowed", children: "Challenge" })] }));
}
function Modal({ children, onClose }) {
    return (_jsx("div", { className: "fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4", onClick: onClose, children: _jsx("div", { className: "bg-felt border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-slide-up", onClick: e => e.stopPropagation(), children: children }) }));
}
