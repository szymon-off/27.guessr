import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import type { AudioPlayer } from '../audio/useAudioPlayer';
import { Waveform } from '../audio/Waveform';
import { STEPS, formatSeconds } from '../game/rules';
import { Timeline } from './Timeline';

interface Props {
  player: AudioPlayer;
  step: number;
  /** Set once the round is over — the whole 16 s becomes playable. */
  revealAll: boolean;
}

export function Player({ player, step, revealAll }: Props) {
  const limit = revealAll ? STEPS[STEPS.length - 1] : STEPS[step];
  const percent = Math.round(player.volume * 100);

  return (
    <section className="player-section">
      <Waveform analyser={player.analyser} isPlaying={player.isPlaying} />

      <button
        type="button"
        className={`play-btn${player.isPlaying ? ' play-btn--playing' : ''}`}
        onClick={() => player.toggle(limit)}
        aria-label={player.isPlaying ? 'Zatrzymaj' : `Odtwórz ${formatSeconds(limit)}`}
      >
        <span className="play-btn-glow" aria-hidden="true" />
        {player.isPlaying ? (
          <Pause className="play-icon" aria-hidden="true" />
        ) : (
          <Play className="play-icon play-icon--offset" aria-hidden="true" />
        )}
      </button>

      <div className="volume-wrap">
        <button
          type="button"
          className="volume-icon-btn"
          onClick={() => player.setVolume(player.volume > 0 ? 0 : 0.8)}
          aria-label={player.volume > 0 ? 'Wycisz' : 'Włącz dźwięk'}
        >
          {player.volume > 0 ? (
            <Volume2 className="icon-md" aria-hidden="true" />
          ) : (
            <VolumeX className="icon-md" aria-hidden="true" />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={player.volume}
          onChange={(e) => player.setVolume(Number(e.target.value))}
          className="volume-slider"
          aria-label="Głośność"
          style={{
            background: `linear-gradient(to right, var(--accent) ${percent}%, var(--bg-raised) ${percent}%)`,
          }}
        />
        <span className="volume-pct">{percent}%</span>
      </div>

      <Timeline step={revealAll ? STEPS.length - 1 : step} progress={player.progress} isPlaying={player.isPlaying} />

      {player.error && <p className="player-error">{player.error}</p>}
    </section>
  );
}
