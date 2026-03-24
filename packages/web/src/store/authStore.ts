import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, type Profile } from '../supabase.js';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  duplicateSession: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  fetchProfile: (session: Session | null) => Promise<void>;
  signOut: () => Promise<void>;
  setDuplicateSession: (val: boolean) => void;
}

console.log('[authStore] module loaded ✓');

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  profile: null,
  loading: true,
  duplicateSession: false,
  setDuplicateSession: (val) => set({ duplicateSession: val }),

  setSession: (session) =>
    set({ session, user: session?.user ?? null, ...(session ? { loading: true } : {}) }),

  setProfile: (profile) => set({ profile }),

  fetchProfile: async (session) => {
    if (!session) {
      set({ profile: null, loading: false });
      return;
    }
    set({ loading: true });
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
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
