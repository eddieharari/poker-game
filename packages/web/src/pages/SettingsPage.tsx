import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Cropper, { type Area } from 'react-easy-crop';
import toast from 'react-hot-toast';
import { supabase } from '../supabase.js';
import { useAuthStore } from '../store/authStore.js';
import { usePreferencesStore } from '../store/preferencesStore.js';
import type { Profile } from '../supabase.js';

const PRESET_AVATARS = Array.from({ length: 32 }, (_, i) => ({
  id: `preset_${i + 1}`,
  url: `/avatars/avatar_${String(i + 1).padStart(2, '0')}.png`,
}));

export function SettingsPage() {
  const { user, profile, setProfile } = useAuthStore();
  const { fourColorDeck, setFourColorDeck } = usePreferencesStore();
  const navigate = useNavigate();

  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const previewUrl = selectedPreset
    ? PRESET_AVATARS.find(p => p.id === selectedPreset)?.url ?? ''
    : uploadedUrl ?? profile?.avatar_url ?? '';

  const [initialFourColor] = useState(fourColorDeck);
  const avatarChanged = !!selectedPreset || !!uploadedUrl;

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

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      if (avatarChanged) {
        const avatarUrl = selectedPreset
          ? PRESET_AVATARS.find(p => p.id === selectedPreset)?.url ?? ''
          : uploadedUrl ?? '';
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

  return (
    <div
      className="min-h-screen p-4"
      style={{
        backgroundImage: 'url(/bg-poker.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Header */}
      <header className="bg-black/60 backdrop-blur-sm border-b border-white/10 px-6 py-4 flex items-center gap-4 -mx-4 -mt-4 mb-6">
        <button
          onClick={() => navigate('/lobby')}
          className="text-white/60 hover:text-white transition-colors"
          aria-label="Back to lobby"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="font-display text-xl text-gold">Settings</h1>
      </header>

      <div className="max-w-lg mx-auto space-y-6 bg-black/60 backdrop-blur-sm rounded-2xl p-6 border border-white/10 shadow-2xl">

        {/* ── Avatar section ─────────────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-white/80 font-semibold text-sm uppercase tracking-wider border-b border-white/10 pb-2">
            Avatar
          </h2>

          {/* Current / preview */}
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-gold ring-4 ring-gold/30 shadow-lg shadow-gold/20">
              <img src={previewUrl} alt="avatar" className="w-full h-full object-cover" />
            </div>
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

          {/* Preset grid */}
          <div className="grid grid-cols-4 gap-3 max-h-80 overflow-y-auto pr-1">
            {PRESET_AVATARS.map(preset => (
              <button
                key={preset.id}
                onClick={() => { setSelectedPreset(preset.id); setUploadedUrl(null); }}
                className={`aspect-square rounded-xl overflow-hidden border-2 transition-all
                  ${selectedPreset === preset.id
                    ? 'border-gold scale-105 ring-2 ring-gold/50 shadow-lg shadow-gold/20'
                    : 'border-transparent hover:border-white/40'}`}
              >
                <img src={preset.url} alt={`Avatar ${preset.id}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>

          {/* Upload */}
          <label className="btn-ghost w-full flex items-center justify-center gap-2 cursor-pointer">
            <span>📷</span>
            <span>{uploadedUrl ? 'Change photo' : 'Upload your own'}</span>
            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </label>
        </section>

        {/* ── Deck style ─────────────────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-white/80 font-semibold text-sm uppercase tracking-wider border-b border-white/10 pb-2">
            Deck Style
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {/* Classic deck */}
            <button
              onClick={() => setFourColorDeck(false)}
              className={`rounded-xl p-4 border-2 transition-all space-y-3 ${
                !fourColorDeck
                  ? 'border-gold bg-gold/10 shadow-lg shadow-gold/10'
                  : 'border-white/10 bg-white/5 hover:border-white/30'
              }`}
            >
              <div className="flex justify-center gap-1">
                {(['♠','♣','♥','♦'] as const).map((s, i) => (
                  <span key={i} style={{ color: i < 2 ? '#111827' : '#dc2626' }}
                    className="text-xl font-black bg-white rounded px-1">{s}</span>
                ))}
              </div>
              <p className="text-xs text-white/70 font-medium">Classic</p>
              <p className="text-xs text-white/40">Black & Red</p>
            </button>

            {/* 4-color deck */}
            <button
              onClick={() => setFourColorDeck(true)}
              className={`rounded-xl p-4 border-2 transition-all space-y-3 ${
                fourColorDeck
                  ? 'border-gold bg-gold/10 shadow-lg shadow-gold/10'
                  : 'border-white/10 bg-white/5 hover:border-white/30'
              }`}
            >
              <div className="flex justify-center gap-1">
                <span style={{ color: '#111827' }} className="text-xl font-black bg-white rounded px-1">♠</span>
                <span style={{ color: '#16a34a' }} className="text-xl font-black bg-white rounded px-1">♣</span>
                <span style={{ color: '#dc2626' }} className="text-xl font-black bg-white rounded px-1">♥</span>
                <span style={{ color: '#2563eb' }} className="text-xl font-black bg-white rounded px-1">♦</span>
              </div>
              <p className="text-xs text-white/70 font-medium">4-Color</p>
              <p className="text-xs text-white/40">Black, Green, Red, Blue</p>
            </button>
          </div>
        </section>

        {/* ── Save ───────────────────────────────────────────────── */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
