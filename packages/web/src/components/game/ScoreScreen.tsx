import type { GameScore, GameState } from '@poker5o/shared';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../store/gameStore.js';

interface Props {
  score: GameScore;
  state: GameState;
  playerIndex: 0 | 1;
}

export function ScoreScreen({ score, state, playerIndex }: Props) {
  const navigate = useNavigate();
  const reset = useGameStore(s => s.reset);
  const me    = state.players[playerIndex];
  const them  = state.players[playerIndex === 0 ? 1 : 0];

  const iWon  = score.winner === playerIndex;
  const isDraw= score.winner === 'draw';

  return (
    <div className="min-h-screen bg-felt-dark flex flex-col items-center justify-center p-6 gap-8 animate-slide-up">
      {/* Result banner */}
      <div className="text-center">
        <p className="text-6xl mb-3">
          {isDraw ? '🤝' : iWon ? '🏆' : '😞'}
        </p>
        <h2 className="font-display text-4xl text-gold">
          {isDraw ? 'Draw!' : iWon ? 'You Win!' : 'You Lose!'}
        </h2>
        <p className="text-white/50 mt-1">
          {score.player0Wins}–{score.player1Wins}
          {score.draws > 0 ? ` (${score.draws} tied)` : ''}
        </p>
      </div>

      {/* Column-by-column results */}
      <div className="w-full max-w-xl space-y-2">
        <h3 className="text-white/50 text-sm font-semibold uppercase tracking-wider text-center mb-4">Column Results</h3>
        {score.columnResults.map((r, i) => {
          const myEval   = r[playerIndex === 0 ? 'player0Hand' : 'player1Hand'];
          const themEval = r[playerIndex === 0 ? 'player1Hand' : 'player0Hand'];
          const iWonCol  = r.winner === playerIndex;
          const colDraw  = r.winner === 'draw';

          return (
            <div key={i}
              className={`rounded-xl border p-3 flex items-center gap-3
                ${iWonCol ? 'border-gold/40 bg-gold/10' : colDraw ? 'border-white/10 bg-white/5' : 'border-red-900/40 bg-red-900/10'}`}>
              <span className="text-2xl">{iWonCol ? '✅' : colDraw ? '🤝' : '❌'}</span>
              <div className="flex-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/60">{me.name}</span>
                  <span className={iWonCol ? 'text-gold font-semibold' : 'text-white/80'}>{myEval.label}</span>
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="text-white/60">{them.name}</span>
                  <span className={!iWonCol && !colDraw ? 'text-gold font-semibold' : 'text-white/80'}>{themEval.label}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => { reset(); navigate('/lobby'); }}
        className="btn-primary px-10 py-3 text-lg"
      >
        Back to Lobby
      </button>
    </div>
  );
}
