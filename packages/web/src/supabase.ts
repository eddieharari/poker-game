import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Profile = {
  id: string;
  nickname: string;
  avatar_url: string;
  avatar_is_preset: boolean;
  chips: number;
  wins: number;
  losses: number;
  draws: number;
  created_at: string;
};
