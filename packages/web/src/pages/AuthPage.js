import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../supabase.js';
import { useAuthStore } from '../store/authStore.js';
export function AuthPage() {
    const { session } = useAuthStore();
    const [mode, setMode] = useState('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    if (session)
        return _jsx(Navigate, { to: "/", replace: true });
    async function handleSubmit(e) {
        e.preventDefault();
        setLoading(true);
        try {
            if (mode === 'login') {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error)
                    throw error;
            }
            else {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error)
                    throw error;
                toast.success('Check your email to confirm your account!');
            }
        }
        catch (err) {
            toast.error(err instanceof Error ? err.message : 'Authentication failed');
        }
        finally {
            setLoading(false);
        }
    }
    async function handleGoogle() {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
        });
    }
    return (_jsx("div", { className: "min-h-screen flex items-center justify-center p-4", style: {
            backgroundImage: 'url(/bg-poker.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
        }, children: _jsxs("div", { className: "w-full max-w-sm space-y-6 animate-slide-up bg-black/60 backdrop-blur-sm rounded-2xl p-8 border border-white/10 shadow-2xl", children: [_jsxs("div", { className: "text-center", children: [_jsx("h1", { className: "font-display text-5xl text-gold drop-shadow-lg", children: "Poker5O" }), _jsx("p", { className: "text-white/50 mt-1 text-sm", children: "5 columns. 5 cards. Best hand wins." })] }), _jsx("div", { children: _jsxs("button", { onClick: handleGoogle, className: "btn-ghost w-full flex items-center justify-center gap-3", children: [_jsx(GoogleIcon, {}), "Continue with Google"] }) }), _jsxs("div", { className: "flex items-center gap-3 text-white/30 text-sm", children: [_jsx("div", { className: "flex-1 h-px bg-white/10" }), "or", _jsx("div", { className: "flex-1 h-px bg-white/10" })] }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-3", children: [_jsx("input", { type: "email", placeholder: "Email", value: email, onChange: e => setEmail(e.target.value), className: "input", required: true }), _jsx("input", { type: "password", placeholder: "Password", value: password, onChange: e => setPassword(e.target.value), className: "input", required: true, minLength: 6 }), _jsx("button", { type: "submit", disabled: loading, className: "btn-primary w-full", children: loading ? 'Loading…' : mode === 'login' ? 'Log In' : 'Sign Up' })] }), _jsxs("p", { className: "text-center text-white/50 text-sm", children: [mode === 'login' ? "Don't have an account? " : 'Already have an account? ', _jsx("button", { onClick: () => setMode(mode === 'login' ? 'signup' : 'login'), className: "text-gold hover:underline", children: mode === 'login' ? 'Sign Up' : 'Log In' })] })] }) }));
}
function GoogleIcon() {
    return (_jsxs("svg", { className: "w-5 h-5", viewBox: "0 0 24 24", children: [_jsx("path", { fill: "#4285F4", d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" }), _jsx("path", { fill: "#34A853", d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" }), _jsx("path", { fill: "#FBBC05", d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" }), _jsx("path", { fill: "#EA4335", d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" })] }));
}
