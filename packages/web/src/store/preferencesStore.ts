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
      fourColorDeck: false,
      setFourColorDeck: (val) => set({ fourColorDeck: val }),
      twoCornerDeck: false,
      setTwoCornerDeck: (val) => set({ twoCornerDeck: val }),
    }),
    { name: 'poker5o-preferences' },
  ),
);
