import { useState, useEffect } from 'react';

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
  const CENTER_H     = 96;      // center strip (deck + draw button)
  const PAD_V        = 16;      // top+bottom padding
  const PAD_H        = 16;      // horizontal padding (both sides)

  // Vertical: two grids + center strip
  const availH = window.innerHeight
    - HEADER_H
    - CENTER_H
    - 2 * (ROW_LABEL_H + HAND_LABEL_H)
    - PAD_V;

  // COL_H = CARD_H * 7/3 → cardH = availH/2 * 3/7
  const cardHFromHeight = (availH / 2) * (3 / 7);

  // Horizontal: 5 cards fill full width
  const availW = window.innerWidth - PAD_H * 2;
  const cardWFromWidth = availW / 5;
  const cardHFromWidth = cardWFromWidth * ASPECT;

  const cardH = Math.max(48, Math.min(150, Math.floor(Math.min(cardHFromHeight, cardHFromWidth))));
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
