import { useCallback, useEffect, useState } from 'react';
import { useAudioPlayer } from './audio/useAudioPlayer';
import { DateNav } from './components/DateNav';
import { GuessInput } from './components/GuessInput';
import { GuessList } from './components/GuessList';
import { Header } from './components/Header';
import { HowToModal } from './components/HowToModal';
import { assetUrl } from './components/Logo';
import { Player } from './components/Player';
import { ResultCard } from './components/ResultCard';
import { StatsModal } from './components/StatsModal';
import { CATALOG } from './data/catalog';
import { todayDay } from './game/daily';
import { STEPS } from './game/rules';
import { useGame, type Mode } from './game/useGame';
import { useTheme } from './useTheme';

type Dialog = 'howto' | 'stats' | null;

export default function App() {
  const [theme, setTheme] = useTheme();
  const [mode, setMode] = useState<Mode>('daily');
  const [today] = useState(() => Math.max(1, todayDay()));
  const [day, setDay] = useState(today);
  const [dialog, setDialog] = useState<Dialog>(null);

  const game = useGame(mode, mode === 'daily' ? day : 0);
  const player = useAudioPlayer(game.song.previewUrl);
  const finished = game.status !== 'playing';
  const limit = finished ? STEPS[STEPS.length - 1] : STEPS[game.step];

  // Space toggles playback, the way every other Heardle does — but not while
  // the player is typing a title or a dialog is open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || dialog !== null) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;
      e.preventDefault();
      player.toggle(limit);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog, limit, player]);

  // Stop the audio when the round or the mode changes under it.
  const { stop } = player;
  useEffect(() => stop(), [game.song.id, stop]);

  const changeMode = useCallback((next: Mode) => {
    setMode(next);
    setDialog(null);
  }, []);

  return (
    <>
      <img className="app-watermark" src={assetUrl('logo-27.png')} alt="" aria-hidden="true" />

      <main className="app-shell">
        <Header
          theme={theme}
          onTheme={setTheme}
          mode={mode}
          onMode={changeMode}
          onHowTo={() => setDialog('howto')}
          onStats={() => setDialog('stats')}
        />

        {mode === 'daily' ? (
          <DateNav day={day} today={today} onChange={setDay} />
        ) : (
          <p className="practice-note">
            Trening — losowy utwór z {CATALOG.length}. Wynik nie liczy się do statystyk.
          </p>
        )}

        <Player player={player} step={game.step} revealAll={finished} />

        <GuessList guesses={game.guesses} active={!finished} />

        {finished ? (
          <ResultCard
            song={game.song}
            guesses={game.guesses}
            won={game.status === 'won'}
            mode={mode}
            day={day}
            onAgain={game.again}
          />
        ) : (
          <GuessInput
            step={game.step}
            disabled={finished}
            onGuess={game.submit}
            onSkip={game.skip}
          />
        )}

        <footer className="app-footer">
          <span>
            27.GUESSR — nieoficjalna gra fanowska. Fragmenty pochodzą z publicznego API Apple
            Music.
          </span>
          <span>Inspirowane 33HIT · Heardle</span>
        </footer>
      </main>

      {dialog === 'howto' && <HowToModal onClose={() => setDialog(null)} />}
      {dialog === 'stats' && (
        <StatsModal stats={game.stats} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
