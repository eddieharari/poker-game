import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Cropper, { type Area } from 'react-easy-crop';
import toast from 'react-hot-toast';
import { supabase } from '../supabase.js';
import { useAuthStore } from '../store/authStore.js';

// 20 preset avatars — color + initials placeholder until real assets are added
const PRESET_AVATARS = Array.from({ length: 20 }, (_, i) => ({
  id: `preset_${i + 1}`,
  url: `/avatars/presets/avatar_${String(i + 1).padStart(2, '0')}.png`,
  color: ['#e03c31','#2563eb','#16a34a','#d4a017','#7c3aed','#db2777','#0891b2',
          '#ea580c','#65a30d','#0d9488'][i % 10],
}));

export function OnboardingPage() {
  const { user, fetchProfile } = useAuthStore();
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
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ nickname, avatarUrl, avatarIsPreset: isPreset }),
      });
      if (!res.ok) {
        const { error } = await res.json() as { error: string };
        throw new Error(error);
      }
      await fetchProfile();
      navigate('/lobby');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-felt-dark p-4">
      <div className="w-full max-w-lg space-y-8 animate-slide-up">
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
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-gold ring-4 ring-gold/30">
                <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              </div>
            </div>
          )}

          {/* Preset grid */}
          <div className="grid grid-cols-5 gap-2">
            {PRESET_AVATARS.map(preset => (
              <button
                key={preset.id}
                onClick={() => { setSelectedPreset(preset.id); setUploadedUrl(null); }}
                className={`aspect-square rounded-full border-2 overflow-hidden transition-all
                  ${selectedPreset === preset.id ? 'border-gold scale-110' : 'border-transparent hover:border-white/40'}`}
                style={{ backgroundColor: preset.color }}
              >
                <img
                  src={preset.url}
                  alt={preset.id}
                  className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
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
