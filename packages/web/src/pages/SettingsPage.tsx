import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../supabase.js';
import { useAuthStore } from '../store/authStore.js';
import { usePreferencesStore } from '../store/preferencesStore.js';
import type { Profile } from '../supabase.js';

const SETTINGS_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
  .st-h { font-family: 'Space Grotesk', sans-serif !important; }
  .glass-panel {
    background: rgba(26, 28, 35, 0.6);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.05);
    box-shadow: 0 8px 32px 0 rgba(0,0,0,0.37);
  }
  .st-stars {
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
    animation: st-twinkle 8s infinite alternate;
  }
  @keyframes st-twinkle { 0% { opacity: 0.3; } 100% { opacity: 0.7; } }
  .st-nebula {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    z-index: 0; pointer-events: none;
    background:
      radial-gradient(circle at 15% 50%, rgba(110,86,207,0.15) 0%, transparent 50%),
      radial-gradient(circle at 85% 30%, rgba(69,243,255,0.1) 0%, transparent 50%);
  }
`;

const PRESET_AVATARS = Array.from({ length: 32 }, (_, i) => ({
  id: `preset_${i + 1}`,
  url: `/avatars/avatar_${String(i + 1).padStart(2, '0')}.png`,
}));

type Tab = 'avatar' | 'deck';

export function SettingsPage() {
  const { user, profile, setProfile } = useAuthStore();
  const { fourColorDeck, setFourColorDeck, twoCornerDeck, setTwoCornerDeck } = usePreferencesStore();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('avatar');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const previewUrl = selectedPreset
    ? PRESET_AVATARS.find(p => p.id === selectedPreset)?.url ?? ''
    : profile?.avatar_url ?? '';

  const avatarChanged = !!selectedPreset;

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      if (avatarChanged) {
        const avatarUrl = PRESET_AVATARS.find(p => p.id === selectedPreset)?.url ?? '';
        const { data, error } = await supabase
          .from('profiles')
          .update({ avatar_url: avatarUrl, avatar_is_preset: !!selectedPreset })
          .eq('id', user.id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        setProfile(data as Profile);
      }
      navigate('/lobby');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'avatar', label: 'Avatar' },
    { id: 'deck',   label: 'Deck Style' },
  ];

  return (
    <div
      className="min-h-screen relative"
      style={{ background: 'radial-gradient(circle at 50% 50%, #12141D 0%, #0B0C10 100%)', fontFamily: "'Inter', sans-serif", color: '#E0E6ED' }}
    >
      <style>{SETTINGS_STYLES}</style>
      <div className="st-stars" />
      <div className="st-nebula" />

      {/* Header */}
      <header className="relative z-10 glass-panel border-b border-white/5 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate('/lobby')}
          className="text-gray-500 hover:text-[#45F3FF] transition-colors"
          aria-label="Back to lobby"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="st-h text-xl tracking-widest text-white uppercase">Settings</h1>
      </header>

      <div className="relative z-10 max-w-lg mx-auto p-4 flex flex-col gap-4">

        {/* Tab bar */}
        <div className="glass-panel flex rounded-2xl p-1 border border-white/5">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? 'text-black'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
              style={activeTab === tab.id ? {
                background: '#45F3FF',
                boxShadow: '0 0 15px rgba(69,243,255,0.3)',
              } : {}}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="glass-panel rounded-2xl p-6 border border-white/5 shadow-2xl">

          {/* ── Avatar tab ───────────────────────────────────────── */}
          {activeTab === 'avatar' && (
            <div className="space-y-4">
              {/* Preview */}
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-[#45F3FF]/60 ring-4 ring-[#45F3FF]/15 shadow-lg"
                  style={{ boxShadow: '0 0 20px rgba(69,243,255,0.2)' }}>
                  <img src={previewUrl} alt="avatar" className="w-full h-full object-cover" />
                </div>
              </div>

              {/* Preset grid */}
              <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
                {PRESET_AVATARS.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedPreset(preset.id)}
                    className={`aspect-square rounded-xl overflow-hidden border-2 transition-all
                      ${selectedPreset === preset.id
                        ? 'scale-105 border-[#45F3FF]/80'
                        : 'border-white/5 hover:border-white/20'}`}
                    style={selectedPreset === preset.id ? { boxShadow: '0 0 12px rgba(69,243,255,0.3)' } : {}}
                  >
                    <img src={preset.url} alt={`Avatar ${preset.id}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !avatarChanged}
                className="w-full py-2.5 rounded-xl st-h text-sm tracking-widest uppercase font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02]"
                style={{ background: '#00FF9D', color: '#000', boxShadow: '0 0 20px rgba(0,255,157,0.25)', border: '1px solid #00FF9D' }}
              >
                {saving ? 'Saving…' : 'Save Avatar'}
              </button>
            </div>
          )}

          {/* ── Deck Style tab ────────────────────────────────────── */}
          {activeTab === 'deck' && (
            <div className="space-y-4">
              <p className="text-gray-600 text-sm text-center tracking-wide">Choose how cards look during the game</p>
              <div className="grid grid-cols-3 gap-3">
                {/* Classic */}
                <button
                  onClick={() => { setFourColorDeck(false); setTwoCornerDeck(false); }}
                  className={`rounded-xl p-4 border-2 transition-all space-y-3 ${
                    !fourColorDeck && !twoCornerDeck
                      ? 'border-[#45F3FF]/60 bg-[#45F3FF]/5'
                      : 'border-white/5 bg-white/2 hover:border-white/15'
                  }`}
                  style={!fourColorDeck && !twoCornerDeck ? { boxShadow: '0 0 15px rgba(69,243,255,0.15)' } : {}}
                >
                  <div className="flex justify-center gap-1">
                    {(['♠','♣','♥','♦'] as const).map((s, i) => (
                      <span key={i} style={{ color: i < 2 ? '#111827' : '#dc2626' }}
                        className="text-base font-black bg-white rounded px-0.5">{s}</span>
                    ))}
                  </div>
                  <p className="text-sm text-gray-300 font-semibold">Classic</p>
                  <p className="text-xs text-gray-600">Black & Red, 4 corners</p>
                </button>

                {/* 4-color */}
                <button
                  onClick={() => { setFourColorDeck(true); setTwoCornerDeck(false); }}
                  className={`rounded-xl p-4 border-2 transition-all space-y-3 ${
                    fourColorDeck && !twoCornerDeck
                      ? 'border-[#45F3FF]/60 bg-[#45F3FF]/5'
                      : 'border-white/5 bg-white/2 hover:border-white/15'
                  }`}
                  style={fourColorDeck && !twoCornerDeck ? { boxShadow: '0 0 15px rgba(69,243,255,0.15)' } : {}}
                >
                  <div className="flex justify-center gap-1">
                    <span style={{ color: '#111827' }} className="text-base font-black bg-white rounded px-0.5">♠</span>
                    <span style={{ color: '#16a34a' }} className="text-base font-black bg-white rounded px-0.5">♣</span>
                    <span style={{ color: '#dc2626' }} className="text-base font-black bg-white rounded px-0.5">♥</span>
                    <span style={{ color: '#2563eb' }} className="text-base font-black bg-white rounded px-0.5">♦</span>
                  </div>
                  <p className="text-sm text-gray-300 font-semibold">4-Color</p>
                  <p className="text-xs text-gray-600">4 suits, 4 corners</p>
                </button>

                {/* 2-corner */}
                <button
                  onClick={() => setTwoCornerDeck(true)}
                  className={`rounded-xl p-4 border-2 transition-all space-y-3 ${
                    twoCornerDeck
                      ? 'border-[#45F3FF]/60 bg-[#45F3FF]/5'
                      : 'border-white/5 bg-white/2 hover:border-white/15'
                  }`}
                  style={twoCornerDeck ? { boxShadow: '0 0 15px rgba(69,243,255,0.15)' } : {}}
                >
                  <div className="flex justify-center gap-2">
                    {(['♠','♥'] as const).map((s, i) => (
                      <span key={i} style={{ color: i === 0 ? '#111827' : '#dc2626' }}
                        className="text-base font-black bg-white rounded px-0.5">{s}</span>
                    ))}
                  </div>
                  <p className="text-sm text-gray-300 font-semibold">2-Corner</p>
                  <p className="text-xs text-gray-600">Diagonal only</p>
                </button>
              </div>

              <div className="text-center text-xs text-gray-600 pt-2">
                Selected: <span className="text-[#45F3FF] font-medium">
                  {twoCornerDeck ? '2-Corner' : fourColorDeck ? '4-Color' : 'Classic'}
                </span> — changes apply instantly
              </div>
            </div>
          )}

        </div>

        {/* Back to Lobby */}
        <button
          onClick={() => navigate('/lobby')}
          className="w-full py-3 rounded-xl flex items-center justify-center gap-2 font-medium text-sm transition-all border border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20"
          style={{ background: 'linear-gradient(180deg, #2A2A40 0%, #1A1C23 100%)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Lobby
        </button>

      </div>
    </div>
  );
}
