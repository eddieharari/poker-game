import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../supabase.js';
import { useAuthStore } from '../store/authStore.js';
import type { Profile } from '../supabase.js';

const PRESET_AVATARS = Array.from({ length: 32 }, (_, i) => ({
  id: `preset_${i + 1}`,
  url: `/avatars/avatar_${String(i + 1).padStart(2, '0')}.png`,
}));

export function OnboardingPage() {
  const { user, setProfile } = useAuthStore();
  const navigate = useNavigate();

  const [nickname, setNickname] = useState('');
  const [nicknameStatus, setNicknameStatus] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Nickname uniqueness check ──────────────────────────────────────────────
  let nicknameTimer: ReturnType<typeof setTimeout>;
  function handleNicknameChange(val: string) {
    setNickname(val);
    clearTimeout(nicknameTimer);
    if (!val) { setNicknameStatus('idle'); return; }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(val)) { setNicknameStatus('invalid'); return; }
    setNicknameStatus('checking');
    nicknameTimer = setTimeout(async () => {
      const res = await fetch(`/api/profile/check-nickname/${encodeURIComponent(val)}`);
      const { available } = await res.json() as { available: boolean };
      setNicknameStatus(available ? 'ok' : 'taken');
    }, 400);
  }

  // ── Save profile ───────────────────────────────────────────────────────────
  const avatarUrl = selectedPreset
    ? PRESET_AVATARS.find(p => p.id === selectedPreset)?.url ?? ''
    : '';
  const canSave = nicknameStatus === 'ok' && !!avatarUrl;

  async function handleSave() {
    if (!canSave || !user) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          nickname,
          avatar_url: avatarUrl,
          avatar_is_preset: true,
        }, { onConflict: 'id' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      setProfile(data as Profile);
      navigate('/lobby');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundImage: 'url(/bg-poker.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="w-full max-w-lg space-y-8 animate-slide-up bg-black/60 backdrop-blur-sm rounded-2xl p-8 border border-white/10 shadow-2xl">
        <div className="text-center">
          <h1 className="font-display text-4xl text-gold">Choose your identity</h1>
          <p className="text-white/50 mt-1">This is how other players will see you</p>
        </div>

        {/* Nickname */}
        <div className="space-y-1">
          <label className="text-sm text-white/70 font-medium">Nickname</label>
          <div className="relative">
            <input
              className="input pr-8"
              placeholder="3–20 chars, letters, numbers, _"
              value={nickname}
              onChange={e => handleNicknameChange(e.target.value)}
              maxLength={20}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg">
              {nicknameStatus === 'ok'      && '✅'}
              {nicknameStatus === 'taken'   && '❌'}
              {nicknameStatus === 'invalid' && '⚠️'}
              {nicknameStatus === 'checking'&& '⏳'}
            </span>
          </div>
          {nicknameStatus === 'taken'   && <p className="text-red-400 text-xs">Nickname already taken</p>}
          {nicknameStatus === 'invalid' && <p className="text-yellow-400 text-xs">3–20 chars, letters/numbers/underscore only</p>}
        </div>

        {/* Avatar selection */}
        <div className="space-y-3">
          <label className="text-sm text-white/70 font-medium">Avatar</label>

          {/* Preview */}
          {avatarUrl && (
            <div className="flex justify-center">
              <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-gold ring-4 ring-gold/30 shadow-lg shadow-gold/20">
                <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              </div>
            </div>
          )}

          {/* Preset grid — 4×4 */}
          <div className="grid grid-cols-4 gap-3">
            {PRESET_AVATARS.map(preset => (
              <button
                key={preset.id}
                onClick={() => setSelectedPreset(preset.id)}
                className={`aspect-square rounded-xl overflow-hidden border-2 transition-all
                  ${selectedPreset === preset.id
                    ? 'border-gold scale-105 ring-2 ring-gold/50 shadow-lg shadow-gold/20'
                    : 'border-transparent hover:border-white/40'}`}
              >
                <img
                  src={preset.url}
                  alt={`Avatar ${preset.id}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="btn-primary w-full text-lg py-3"
        >
          {saving ? 'Saving…' : "Let's Play!"}
        </button>
      </div>
    </div>
  );
}
