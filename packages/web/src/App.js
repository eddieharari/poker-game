import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { supabase } from './supabase.js';
import { useAuthStore } from './store/authStore.js';
import { connectSocket, disconnectSocket } from './socket.js';
import { AuthPage } from './pages/AuthPage.js';
import { OnboardingPage } from './pages/OnboardingPage.js';
import { LobbyPage } from './pages/LobbyPage.js';
import { GamePage } from './pages/GamePage.js';
export function App() {
    const { session, profile, loading, setSession, fetchProfile } = useAuthStore();
    // Bootstrap auth state from Supabase
    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            if (data.session)
                fetchProfile();
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
            setSession(newSession);
            if (newSession)
                fetchProfile();
        });
        return () => subscription.unsubscribe();
    }, [setSession, fetchProfile]);
    // Connect socket when session + profile are ready
    useEffect(() => {
        if (!session || !profile)
            return;
        connectSocket(session.access_token, profile.nickname, profile.avatar_url);
        return () => disconnectSocket();
    }, [session?.access_token, profile?.id]);
    if (loading) {
        return (_jsx("div", { className: "min-h-screen bg-felt-dark flex items-center justify-center", children: _jsxs("div", { className: "text-center space-y-3", children: [_jsx("p", { className: "font-display text-4xl text-gold", children: "Poker5O" }), _jsx("div", { className: "w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto" })] }) }));
    }
    return (_jsxs(BrowserRouter, { children: [_jsx(Toaster, { position: "top-center", toastOptions: {
                    style: { background: '#134f2d', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' },
                } }), _jsxs(Routes, { children: [_jsx(Route, { path: "/auth", element: _jsx(AuthPage, {}) }), _jsx(Route, { path: "/onboarding", element: !session ? _jsx(Navigate, { to: "/auth", replace: true }) : _jsx(OnboardingPage, {}) }), _jsx(Route, { path: "/lobby", element: !session ? _jsx(Navigate, { to: "/auth", replace: true })
                            : !profile ? _jsx(Navigate, { to: "/onboarding", replace: true })
                                : _jsx(LobbyPage, {}) }), _jsx(Route, { path: "/game/:roomId", element: !session ? _jsx(Navigate, { to: "/auth", replace: true })
                            : !profile ? _jsx(Navigate, { to: "/onboarding", replace: true })
                                : _jsx(GamePage, {}) }), _jsx(Route, { path: "/", element: !session ? _jsx(Navigate, { to: "/auth", replace: true })
                            : !profile ? _jsx(Navigate, { to: "/onboarding", replace: true })
                                : _jsx(Navigate, { to: "/lobby", replace: true }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] })] }));
}
