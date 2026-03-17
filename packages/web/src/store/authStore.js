import { create } from 'zustand';
import { supabase } from '../supabase.js';
console.log('[authStore] module loaded ✓');
export const useAuthStore = create((set) => ({
    session: null,
    user: null,
    profile: null,
    loading: true,
    duplicateSession: false,
    setDuplicateSession: (val) => set({ duplicateSession: val }),
    setSession: (session) => set({ session, user: session?.user ?? null }),
    setProfile: (profile) => set({ profile }),
    fetchProfile: async (session) => {
        if (!session) {
            set({ profile: null, loading: false });
            return;
        }
        set({ loading: true });
        const { data, error } = await supabase
            .from('profiles')
            .select('id, nickname, avatar_url, avatar_is_preset, chips, wins, losses, draws, created_at')
            .eq('id', session.user.id)
            .maybeSingle();
        if (error) {
            console.error('[fetchProfile] error:', error.message);
        }
        console.log('[fetchProfile] userId:', session.user.id, '| profile:', data);
        set({ profile: data ?? null, loading: false });
    },
    signOut: async () => {
        await supabase.auth.signOut();
        set({ session: null, user: null, profile: null, loading: false });
    },
}));
