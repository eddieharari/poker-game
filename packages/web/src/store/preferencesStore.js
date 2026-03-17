import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export const usePreferencesStore = create()(persist((set) => ({
    fourColorDeck: false,
    setFourColorDeck: (val) => set({ fourColorDeck: val }),
}), { name: 'poker5o-preferences' }));
