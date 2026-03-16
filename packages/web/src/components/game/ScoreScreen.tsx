import { useState, useEffect } from 'react';
import type { GameScore, GameState, Player } from '@poker5o/shared';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../store/gameStore.js';
import { useAuthStore } from '../../store/authStore.js';
import { useCardSize } from '../../hooks/useCardSize.js';
import { PlayerGrid } from './PlayerGrid.js';

interface Props {
  score: GameScore;
  state: GameState;
  playerIndex: 0 | 1;
}

function prepareReveal(state: GameState, revealedCols: number): GameState {
  return {
    ...state,
    players: state.players.map(p => ({
      ...p,
      columns: p.columns.map((col, colIdx) =>
        col.map((card, rowIdx) => ({
          ...card,
          faceDown: rowIdx === 4 && colIdx > revealedCols,
        }))
      ),
    })) as [Player, Player],
  };
}

export function ScoreScreen({ score, state, playerIndex }: Props) {
  const navigate   = useNavigate();
  const reset      = useGameStore(s => s.reset);
  const fetchProfile = useAuthStore(s => s.fetchProfile);
  const { cardW, cardH } = useCardSize();

  const [revealedCols, setRevealedCols] = useState(-1);

  useEffect(() => {
    if (revealedCols >= 4) return;
    const t = setTimeout(() => setRevealedCols(c => c + 1), revealedCols === -1 ? 900 : 800);
    return () => clearTimeout(t);
  }, [revealedCols]);

  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const revealed  = prepareReveal(state, revealedCols);
  const me        = revealed.players[playerIndex];
  const them      = revealed.players[opponentIndex];

  const iWon  = score.winner === playerIndex;
  const isDraw = score.winner === 'draw';
  const allRevealed = revealedCols >= 4;

  function goToLobby() {
    reset();
    const { session } = useAuthStore.getState();
    fetchProfile(session);
    navigate('/lobby');
  }

  return (
    <div className="h-screen bg-felt-dark flex flex-col overflow-hidden">
      {/* Header — result banner */}
      <header className="flex-shrink-0 bg-black/60 border-b border-white/10 px-4 py-2 flex items-center justify-between gap-4">
        <h1 className="font-display text-lg text-gold shrink-0">Poker5O</h1>

        <div className="flex items-center gap-3">
          {allRevealed ? (
            <>
              <span className="text-2xl">{isDraw ? '🤝' : iWon ? '🏆' : '😞'}</span>
              <span className="font-display text-xl text-gold">
                {isDraw ? 'Draw!' : iWon ? 'You Win!' : 'You Lose!'}
              </span>
              <span className="text-white/50 text-sm">
                {score.player0Wins}–{score.player1Wins}
                {score.draws > 0 ? ` (${score.draws} tied)` : ''}
              </span>
              {score.completeWinBonus && score.isCompleteWin && (
                <span className="text-xs font-semibold bg-gold/20 text-gold border border-gold/40 rounded-full px-2 py-0.5">
                  🏆 Complete Win — Double Payout!
                </span>
              )}
            </>
          ) : (
            <>
              <span className="text-white/50 text-sm">Revealing results…</span>
              <button
                onClick={() => setRevealedCols(4)}
                className="btn-ghost text-xs px-2 py-1"
              >
                Skip reveal
              </button>
            </>
          )}
        </div>

        <button onClick={goToLobby} className="btn-primary px-4 py-1.5 text-sm shrink-0">
          Back to Lobby
        </button>
      </header>

      {/* Table + side panel */}
      <div className="flex-1 flex overflow-hidden">

        {/* Both grids with column result indicators between them */}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-3 px-2">

          {/* Opponent grid */}
          <PlayerGrid
            player={them}
            isMe={false}
            currentRow={state.currentRow}
            drawnCard={null}
            isMyTurn={false}
            phase="GAME_OVER"
            onPlaceCard={() => {}}
            avatarUrl={state.players[opponentIndex]?.avatarUrl}
            cardW={cardW}
            cardH={cardH}
            revealAll
          />

          {/* Column win/loss indicators */}
          <div className="flex gap-3 justify-center">
            {score.columnResults.map((r, i) => {
              if (i > revealedCols) return <div key={i} style={{ width: cardW }} />;
              const myWon = r.winner === playerIndex;
              const draw  = r.winner === 'draw';
              return (
                <div key={i} style={{ width: cardW }}
                  className="flex items-center justify-center">
                  <span className="text-base leading-none">
                    {myWon ? '✅' : draw ? '🤝' : '❌'}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="w-full max-w-lg h-px bg-white/10 mx-auto" />

          {/* My grid */}
          <PlayerGrid
            player={me}
            isMe={true}
            currentRow={state.currentRow}
            drawnCard={null}
            isMyTurn={false}
            phase="GAME_OVER"
            onPlaceCard={() => {}}
            avatarUrl={state.players[playerIndex]?.avatarUrl}
            cardW={cardW}
            cardH={cardH}
            revealAll
          />
        </div>

        {/* Side panel: column-by-column breakdown */}
        <div
          className="flex-shrink-0 flex flex-col justify-center gap-2 py-4 px-2 border-l border-white/10 bg-black/30 overflow-y-auto"
          style={{ width: Math.max(cardW + 32, 150) }}
        >
          {score.columnResults.map((r, i) => {
            if (i > revealedCols) {
              return (
                <div key={i} className="rounded-lg p-2 text-xs border border-white/10 bg-white/5 opacity-40">
                  <div className="text-white/40 font-medium">Col {i + 1}</div>
                  <div className="text-white/30">Revealing...</div>
                </div>
              );
            }

            const myEval   = r[playerIndex === 0 ? 'player0Hand' : 'player1Hand'];
            const themEval = r[playerIndex === 0 ? 'player1Hand' : 'player0Hand'];
            const myWon    = r.winner === playerIndex;
            const draw     = r.winner === 'draw';

            return (
              <div key={i}
                className={`rounded-lg p-2 text-xs border
                  ${myWon  ? 'border-gold/40 bg-gold/10'
                  : draw   ? 'border-white/10 bg-white/5'
                           : 'border-red-900/40 bg-red-900/10'}`}
              >
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-sm">{myWon ? '✅' : draw ? '🤝' : '❌'}</span>
                  <span className="text-white/40 font-medium">Col {i + 1}</span>
                </div>
                <div className="text-white/70 leading-snug">
                  <span className="text-white/40">{me.name}: </span>
                  <span className={myWon ? 'text-gold font-semibold' : ''}>{myEval.label}</span>
                </div>
                <div className="text-white/70 leading-snug">
                  <span className="text-white/40">{them.name}: </span>
                  <span className={!myWon && !draw ? 'text-gold font-semibold' : ''}>{themEval.label}</span>
                </div>
              </div>
            );
          })}

          {allRevealed && (
            <div className={`rounded-lg p-3 text-center border mt-2
              ${isDraw   ? 'border-white/20 bg-white/10'
              : iWon     ? 'border-gold/40 bg-gold/10'
                         : 'border-red-900/40 bg-red-900/10'}`}
            >
              <div className="text-2xl mb-1">{isDraw ? '🤝' : iWon ? '🏆' : '😞'}</div>
              <div className="font-display text-gold text-sm">
                {isDraw ? 'Draw!' : iWon ? 'You Win!' : 'You Lose!'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
