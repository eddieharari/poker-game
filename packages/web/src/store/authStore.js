import { create } from 'zustand';
import { supabase } from '../supabase.js';
export const useAuthStore = create((set, get) => ({
    session: null,
    user: null,
    profile: null,
    loading: true,
    setSession: (session) => set({ session, user: session?.user ?? null, loading: false }),
    setProfile: (profile) => set({ profile }),
    fetchProfile: async () => {
        const { user } = get();
        if (!user)
            return;
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
        set({ profile: data ?? null });
    },
    signOut: async () => {
        await supabase.auth.signOut();
        set({ session: null, user: null, profile: null });
    },
}));
