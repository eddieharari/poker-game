import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../supabase.js';
import { useAuthStore } from '../store/authStore.js';

const AUTH_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
  .auth-h { font-family: 'Space Grotesk', sans-serif !important; }
  .glass-panel {
    background: rgba(26, 28, 35, 0.6);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.05);
    box-shadow: 0 8px 32px 0 rgba(0,0,0,0.37);
  }
  .auth-input {
    width: 100%;
    background: rgba(0,0,0,0.4);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 12px 16px;
    color: #E0E6ED;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .auth-input::placeholder { color: rgba(255,255,255,0.25); }
  .auth-input:focus {
    border-color: rgba(69,243,255,0.5);
    box-shadow: 0 0 0 3px rgba(69,243,255,0.08);
  }
  .auth-stars {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    z-index: 0; pointer-events: none;
    background-image:
      radial-gradient(1px 1px at 20px 30px, #fff, rgba(0,0,0,0)),
      radial-gradient(1px 1px at 40px 70px, #fff, rgba(0,0,0,0)),
      radial-gradient(1px 1px at 50px 160px, #fff, rgba(0,0,0,0)),
      radial-gradient(2px 2px at 90px 40px, rgba(255,255,255,0.8), rgba(0,0,0,0)),
      radial-gradient(2px 2px at 130px 80px, rgba(255,255,255,0.8), rgba(0,0,0,0)),
      radial-gradient(1px 1px at 160px 120px, #fff, rgba(0,0,0,0));
    background-repeat: repeat;
    background-size: 300px 300px;
    animation: auth-twinkle 8s infinite alternate;
  }
  @keyframes auth-twinkle { 0% { opacity: 0.3; } 100% { opacity: 0.7; } }
  .auth-nebula {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    z-index: 0; pointer-events: none;
    background:
      radial-gradient(circle at 15% 50%, rgba(110,86,207,0.15) 0%, transparent 50%),
      radial-gradient(circle at 85% 30%, rgba(69,243,255,0.1) 0%, transparent 50%);
  }
`;

type Mode = 'login' | 'signup';

export function AuthPage() {
  const { session } = useAuthStore();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success('Check your email to confirm your account!');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  return (
    <div
      className="h-screen overflow-hidden flex items-center justify-center p-4 relative"
      style={{ background: 'radial-gradient(circle at 50% 50%, #12141D 0%, #0B0C10 100%)', fontFamily: "'Inter', sans-serif", color: '#E0E6ED' }}
    >
      <style>{AUTH_STYLES}</style>
      <div className="auth-stars" />
      <div className="auth-nebula" />

      <div className="relative z-10 w-full max-w-sm space-y-6 animate-slide-up glass-panel rounded-2xl p-8 border border-white/10 shadow-2xl">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-[#45F3FF] animate-pulse" style={{ boxShadow: '0 0 12px #45F3FF' }} />
            <h1 className="auth-h text-4xl tracking-widest text-white uppercase" style={{ textShadow: '0 0 30px rgba(69,243,255,0.3)' }}>Poker5O</h1>
            <div className="w-2 h-2 rounded-full bg-[#45F3FF] animate-pulse" style={{ boxShadow: '0 0 12px #45F3FF' }} />
          </div>
          <p className="text-gray-600 text-sm tracking-wide">5 columns. 5 cards. Best hand wins.</p>
        </div>

        {/* Google OAuth */}
        <button
          onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-medium text-sm transition-all border border-white/10 text-gray-300 hover:text-white hover:border-white/20"
          style={{ background: 'linear-gradient(180deg, #2A2A40 0%, #1A1C23 100%)', boxShadow: '0 4px 15px rgba(0,0,0,0.4)' }}
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="flex items-center gap-3 text-gray-700 text-sm">
          <div className="flex-1 h-px bg-white/5" />
          or
          <div className="flex-1 h-px bg-white/5" />
        </div>

        {/* Email form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="auth-input"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="auth-input"
            required
            minLength={6}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl auth-h text-sm tracking-widest uppercase font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02]"
            style={{ background: '#00FF9D', color: '#000', boxShadow: '0 0 25px rgba(0,255,157,0.3)', border: '1px solid #00FF9D' }}
          >
            {loading ? 'Loading…' : mode === 'login' ? 'Log In' : 'Sign Up'}
          </button>
        </form>

        <p className="text-center text-gray-600 text-sm">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="text-[#45F3FF] hover:underline font-medium"
          >
            {mode === 'login' ? 'Sign Up' : 'Log In'}
          </button>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
