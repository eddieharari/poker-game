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
import { PazPazPage } from './pages/PazPazPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { AdminPage } from './pages/AdminPage.js';
import { CashierPage } from './pages/CashierPage.js';
import { AgentPage } from './pages/AgentPage.js';

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
    return (
      <div className="min-h-screen bg-felt-dark flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="font-display text-4xl text-gold">Poker5O</p>
          <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: { background: '#134f2d', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' },
        }}
      />
      <Routes>
        <Route path="/auth" element={<AuthPage />} />

        {/* Requires auth */}
        <Route path="/onboarding" element={
          !session ? <Navigate to="/auth" replace />
          : profile ? <Navigate to="/lobby" replace />
          : <OnboardingPage />
        } />
        <Route path="/lobby" element={
          !session ? <Navigate to="/auth" replace />
          : !profile ? <Navigate to="/onboarding" replace />
          : <LobbyPage />
        } />
        <Route path="/settings" element={
          !session ? <Navigate to="/auth" replace />
          : !profile ? <Navigate to="/onboarding" replace />
          : <SettingsPage />
        } />
        <Route path="/game/:roomId" element={
          !session ? <Navigate to="/auth" replace />
          : !profile ? <Navigate to="/onboarding" replace />
          : <GamePage />
        } />
        <Route path="/pazpaz/:roomId" element={
          !session ? <Navigate to="/auth" replace />
          : !profile ? <Navigate to="/onboarding" replace />
          : <PazPazPage />
        } />

        {/* Cashier — requires auth */}
        <Route path="/cashier" element={
          !session ? <Navigate to="/auth" replace />
          : !profile ? <Navigate to="/onboarding" replace />
          : <CashierPage />
        } />

        {/* Admin — no auth protection */}
        <Route path="/admin" element={<AdminPage />} />

        {/* Agent — requires auth */}
        <Route path="/agent" element={
          !session ? <Navigate to="/auth" replace />
          : !profile ? <Navigate to="/onboarding" replace />
          : <AgentPage />
        } />

        {/* Root redirect */}
        <Route path="/" element={
          !session ? <Navigate to="/auth" replace />
          : !profile ? <Navigate to="/onboarding" replace />
          : <Navigate to="/lobby" replace />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Duplicate session confirmation modal */}
      {duplicateSession && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-felt border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-5 animate-slide-up">
            <div className="text-center space-y-2">
              <p className="text-3xl">⚠️</p>
              <h2 className="font-display text-xl text-gold">Already Logged In</h2>
              <p className="text-white/60 text-sm">
                Your account is active in another window or device. Do you want to log in here and close the other session?
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={cancelTakeover} className="btn-ghost flex-1">
                Cancel
              </button>
              <button onClick={confirmTakeover} className="btn-primary flex-1">
                Log In Here
              </button>
            </div>
          </div>
        </div>
      )}
    </BrowserRouter>
  );
}
