import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PreferencesState {
  fourColorDeck: boolean;
  setFourColorDeck: (val: boolean) => void;
  twoCornerDeck: boolean;
  setTwoCornerDeck: (val: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      fourColorDeck: true,  // colored deck is the default
      setFourColorDeck: (val) => set({ fourColorDeck: val }),
      twoCornerDeck: false,
      setTwoCornerDeck: (val) => set({ twoCornerDeck: val }),
    }),
    {
      name: 'poker5o-preferences',
      version: 2, // bumped to clear old cached value (was false)
    },
  ),
);
