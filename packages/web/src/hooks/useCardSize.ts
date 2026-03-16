import { useState, useEffect } from 'react';

export interface CardSize {
  cardW: number;
  cardH: number;
  peek: number;
  colH: number;
}

function compute(): CardSize {
  const ASPECT      = 3 / 2;       // height / width
  const HEADER_H    = 48;           // top header bar
  const ROW_LABEL_H = 20;           // player name row per grid
  const HAND_LABEL_H = 16;          // hand-rank label per column (above/below)
  const DIVIDER_H   = 1;
  const PAD_V       = 16;           // top+bottom padding inside table area
  const COL_GAPS    = 4 * 12;       // 4 × gap-3 between 5 columns
  const SIDE_W      = 136;          // approx side-panel width
  const PAD_H       = 32;           // horizontal padding

  // Vertical: space for two grids (COL_H each) + labels
  const availH = window.innerHeight
    - HEADER_H
    - 2 * (ROW_LABEL_H + HAND_LABEL_H)
    - DIVIDER_H
    - PAD_V;

  // COL_H = CARD_H + 4 * PEEK = CARD_H + 4*(CARD_H/3) = CARD_H * 7/3
  // Two grids → 2 * CARD_H * 7/3
  const cardHFromHeight = (availH / 2) * (3 / 7);

  // Horizontal: 5 columns of CARD_W + gaps, minus side panel
  const availW = window.innerWidth - SIDE_W - PAD_H - COL_GAPS;
  const cardWFromWidth = availW / 5;
  const cardHFromWidth = cardWFromWidth * ASPECT;

  const cardH = Math.max(60, Math.min(170, Math.floor(Math.min(cardHFromHeight, cardHFromWidth))));
  const cardW = Math.floor(cardH / ASPECT);
  const peek  = Math.floor(cardH / 3);
  const colH  = cardH + 4 * peek;

  return { cardW, cardH, peek, colH };
}

export function useCardSize(): CardSize {
  const [size, setSize] = useState<CardSize>(compute);

  useEffect(() => {
    const update = () => setSize(compute());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return size;
}
