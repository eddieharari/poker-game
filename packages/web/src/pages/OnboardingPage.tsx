import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Cropper, { type Area } from 'react-easy-crop';
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
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
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

  // ── Avatar upload + crop ───────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    setSelectedPreset(null);
  }

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  async function applyCrop() {
    if (!cropSrc || !croppedAreaPixels || !user) return;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.src = cropSrc;
    await new Promise(r => { img.onload = r; });
    ctx.drawImage(
      img,
      croppedAreaPixels.x, croppedAreaPixels.y,
      croppedAreaPixels.width, croppedAreaPixels.height,
      0, 0, 256, 256,
    );
    const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/webp', 0.85));
    const path = `uploads/${user.id}.webp`;
    const { error } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/webp' });
    if (error) { toast.error('Upload failed'); return; }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setUploadedUrl(data.publicUrl);
    setCropSrc(null);
  }

  // ── Save profile ───────────────────────────────────────────────────────────
  const avatarUrl = selectedPreset
    ? PRESET_AVATARS.find(p => p.id === selectedPreset)?.url ?? ''
    : uploadedUrl ?? '';
  const isPreset = !!selectedPreset;
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
          avatar_is_preset: isPreset,
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

        {/* Crop modal */}
        {cropSrc && (
          <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center gap-4 p-4">
            <div className="relative w-72 h-72 rounded-xl overflow-hidden">
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <input type="range" min={1} max={3} step={0.1} value={zoom}
              onChange={e => setZoom(Number(e.target.value))} className="w-64" />
            <div className="flex gap-3">
              <button onClick={() => setCropSrc(null)} className="btn-ghost">Cancel</button>
              <button onClick={applyCrop} className="btn-primary">Use this photo</button>
            </div>
          </div>
        )}

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
                onClick={() => { setSelectedPreset(preset.id); setUploadedUrl(null); }}
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

          {/* Upload */}
          <label className="btn-ghost w-full flex items-center justify-center gap-2 cursor-pointer">
            <span>📷</span>
            <span>{uploadedUrl ? 'Change photo' : 'Upload your own'}</span>
            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </label>
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
