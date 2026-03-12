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
      if (data.session) fetchProfile();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) fetchProfile();
    });

    return () => subscription.unsubscribe();
  }, [setSession, fetchProfile]);

  // Connect socket when session + profile are ready
  useEffect(() => {
    if (!session || !profile) return;
    connectSocket(session.access_token, profile.nickname, profile.avatar_url);
    return () => disconnectSocket();
  }, [session?.access_token, profile?.id]);

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
          !session ? <Navigate to="/auth" replace /> : <OnboardingPage />
        } />
        <Route path="/lobby" element={
          !session ? <Navigate to="/auth" replace />
          : !profile ? <Navigate to="/onboarding" replace />
          : <LobbyPage />
        } />
        <Route path="/game/:roomId" element={
          !session ? <Navigate to="/auth" replace />
          : !profile ? <Navigate to="/onboarding" replace />
          : <GamePage />
        } />

        {/* Root redirect */}
        <Route path="/" element={
          !session ? <Navigate to="/auth" replace />
          : !profile ? <Navigate to="/onboarding" replace />
          : <Navigate to="/lobby" replace />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
