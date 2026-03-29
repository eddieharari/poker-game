import { useState, useEffect, useCallback } from 'react';

export interface CardSize {
  cardW: number;
  cardH: number;
  peek: number;
  colH: number;
}

function compute(): CardSize {
  const ASPECT       = 3 / 2;   // height / width
  const HEADER_H     = 48;      // top header bar
  const ROW_LABEL_H  = 20;      // player name row per grid
  const HAND_LABEL_H = 16;      // hand-rank label per column
  const CENTER_H     = 120;     // center strip with draw card
  const PAD_V        = 8;       // top+bottom padding
  const PAD_H        = 12;      // horizontal padding (both sides, accounts for mx-2 border)

  // Use visualViewport when available — on iOS/Android it gives the actual
  // visible area, excluding browser chrome (address bar, bottom bar, keyboard).
  // window.innerHeight can lag behind or be inconsistent during SPA navigation.
  const vv = window.visualViewport;
  const W  = vv ? Math.round(vv.width)  : window.innerWidth;
  const H  = vv ? Math.round(vv.height) : window.innerHeight;

  // Vertical: two grids + center strip
  const availH = H
    - HEADER_H
    - CENTER_H
    - 2 * (ROW_LABEL_H + HAND_LABEL_H)
    - PAD_V;

  // COL_H = CARD_H * 7/3 → cardH = availH/2 * 3/7
  const cardHFromHeight = (availH / 2) * (3 / 7);

  // Horizontal: 5 cards with gap-2 (8px × 4 gaps = 32px) between them
  const availW = W - PAD_H * 2;
  const cardWFromWidth = (availW - 32) / 5;
  const cardHFromWidth = cardWFromWidth * ASPECT;

  const cardH = Math.max(60, Math.min(220, Math.floor(Math.min(cardHFromHeight, cardHFromWidth))));
  const cardW = Math.floor(cardH / ASPECT);
  const peek  = Math.floor(cardH / 3);
  const colH  = cardH + 4 * peek;

  return { cardW, cardH, peek, colH };
}

export function useCardSize(): CardSize & { recompute: () => void } {
  const [size, setSize] = useState<CardSize>(compute);
  const recompute = useCallback(() => setSize(compute()), []);

  useEffect(() => {
    window.addEventListener('resize', recompute);
    // visualViewport fires on iOS/Android when the browser chrome
    // (address bar, keyboard) shows or hides.
    window.visualViewport?.addEventListener('resize', recompute);
    return () => {
      window.removeEventListener('resize', recompute);
      window.visualViewport?.removeEventListener('resize', recompute);
    };
  }, [recompute]);

  return { ...size, recompute };
}
