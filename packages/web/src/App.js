import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { supabase } from './supabase.js';
import { useAuthStore } from './store/authStore.js';
import { connectSocket, disconnectSocket, getSocket } from './socket.js';
import { AuthPage } from './pages/AuthPage.js';
import { OnboardingPage } from './pages/OnboardingPage.js';
import { LobbyPage } from './pages/LobbyPage.js';
import { GamePage } from './pages/GamePage.js';
import { SettingsPage } from './pages/SettingsPage.js';
export function App() {
    const { session, profile, loading, setSession, fetchProfile, duplicateSession, setDuplicateSession } = useAuthStore();
    // Bootstrap auth state from Supabase.
    // onAuthStateChange fires immediately with INITIAL_SESSION (replaces getSession),
    // then again on login/logout — single source of truth for auth state.
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
            setSession(newSession);
            fetchProfile(newSession); // pass session directly — no store timing dependency
        });
        return () => subscription.unsubscribe();
    }, [setSession, fetchProfile]);
    // Synchronously connect so socket exists before child component effects run
    if (session && profile) {
        connectSocket(session.access_token, profile.nickname, profile.avatar_url);
    }
    // Keep a useEffect only to disconnect on logout
    useEffect(() => {
        if (!session || !profile) {
            disconnectSocket();
        }
    }, [session?.access_token, profile?.id]);
    function confirmTakeover() {
        setDuplicateSession(false);
        getSocket().emit('session:confirm_takeover');
    }
    function cancelTakeover() {
        setDuplicateSession(false);
        disconnectSocket();
    }
    if (loading) {
        return (_jsx("div", { className: "min-h-screen bg-felt-dark flex items-center justify-center", children: _jsxs("div", { className: "text-center space-y-3", children: [_jsx("p", { className: "font-display text-4xl text-gold", children: "Poker5O" }), _jsx("div", { className: "w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto" })] }) }));
    }
    return (_jsxs(BrowserRouter, { children: [_jsx(Toaster, { position: "top-center", toastOptions: {
                    style: { background: '#134f2d', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' },
                } }), _jsxs(Routes, { children: [_jsx(Route, { path: "/auth", element: _jsx(AuthPage, {}) }), _jsx(Route, { path: "/onboarding", element: !session ? _jsx(Navigate, { to: "/auth", replace: true })
                            : profile ? _jsx(Navigate, { to: "/lobby", replace: true })
                                : _jsx(OnboardingPage, {}) }), _jsx(Route, { path: "/lobby", element: !session ? _jsx(Navigate, { to: "/auth", replace: true })
                            : !profile ? _jsx(Navigate, { to: "/onboarding", replace: true })
                                : _jsx(LobbyPage, {}) }), _jsx(Route, { path: "/settings", element: !session ? _jsx(Navigate, { to: "/auth", replace: true })
                            : !profile ? _jsx(Navigate, { to: "/onboarding", replace: true })
                                : _jsx(SettingsPage, {}) }), _jsx(Route, { path: "/game/:roomId", element: !session ? _jsx(Navigate, { to: "/auth", replace: true })
                            : !profile ? _jsx(Navigate, { to: "/onboarding", replace: true })
                                : _jsx(GamePage, {}) }), _jsx(Route, { path: "/", element: !session ? _jsx(Navigate, { to: "/auth", replace: true })
                            : !profile ? _jsx(Navigate, { to: "/onboarding", replace: true })
                                : _jsx(Navigate, { to: "/lobby", replace: true }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }), duplicateSession && (_jsx("div", { className: "fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4", children: _jsxs("div", { className: "bg-felt border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-5 animate-slide-up", children: [_jsxs("div", { className: "text-center space-y-2", children: [_jsx("p", { className: "text-3xl", children: "\u26A0\uFE0F" }), _jsx("h2", { className: "font-display text-xl text-gold", children: "Already Logged In" }), _jsx("p", { className: "text-white/60 text-sm", children: "Your account is active in another window or device. Do you want to log in here and close the other session?" })] }), _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { onClick: cancelTakeover, className: "btn-ghost flex-1", children: "Cancel" }), _jsx("button", { onClick: confirmTakeover, className: "btn-primary flex-1", children: "Log In Here" })] })] }) }))] }));
}
