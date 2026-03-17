import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PreferencesState {
  fourColorDeck: boolean;
  setFourColorDeck: (val: boolean) => void;
  twoCornerDeck: boolean;
  setTwoCornerDeck: (val: boolean) => void;
  autoDrawCard: boolean;
  setAutoDrawCard: (val: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      fourColorDeck: false,
      setFourColorDeck: (val) => set({ fourColorDeck: val }),
      twoCornerDeck: false,
      setTwoCornerDeck: (val) => set({ twoCornerDeck: val }),
      autoDrawCard: false,
      setAutoDrawCard: (val) => set({ autoDrawCard: val }),
    }),
    { name: 'poker5o-preferences' },
  ),
);
