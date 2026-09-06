import { FULL_LENGTH, SEGMENT_WEIGHTS, STEP_OFFSETS, STEPS, formatSeconds } from '../game/rules';

interface Props {
  /** Index of the currently unlocked step. */
  step: number;
  /** 0…1 through the unlocked snippet while it plays. */
  progress: number;
  isPlaying: boolean;
}

/**
 * The segmented reveal bar. Each segment is as wide as the audio that attempt
 * unlocks, so the 0.1 s blip is a sliver and the last step owns half the track.
 */
export function Timeline({ step, progress, isPlaying }: Props) {
  const unlocked = STEPS[step];
  const unlockedPercent = STEP_OFFSETS[step];
  const headPercent = unlockedPercent * (isPlaying ? progress : 0);

  return (
    <div className="timeline-wrap">
      <div className="timeline-labels">
        <span>{formatSeconds(STEPS[0])}</span>
        <span>{formatSeconds(FULL_LENGTH)}</span>
      </div>

      <div className="timeline-marker-row" aria-hidden="true">
        {STEPS.slice(0, -1).map((seconds, i) => (
          <div
            key={seconds}
            className={`timeline-marker${i <= step ? ' timeline-marker--reached' : ''}`}
            style={{ left: `${STEP_OFFSETS[i]}%` }}
          >
            {/* The labels row already anchors 0.1s at the far left; repeating
                it here would collide with the 0.5s marker beside it. */}
            {i > 0 && <span className="timeline-marker-label">{formatSeconds(seconds)}</span>}
            <span className="timeline-marker-tick" />
          </div>
        ))}
      </div>

      <div
        className="timeline-track"
        role="progressbar"
        aria-label="Odblokowany fragment"
        aria-valuemin={0}
        aria-valuemax={FULL_LENGTH}
        aria-valuenow={unlocked}
        aria-valuetext={`${formatSeconds(unlocked)} z ${formatSeconds(FULL_LENGTH)}`}
      >
        <div className="timeline-segments">
          {STEPS.map((seconds, i) => (
            <div
              key={seconds}
              className={`timeline-seg${i <= step ? ' timeline-seg--unlocked' : ''}`}
              style={{ flexGrow: SEGMENT_WEIGHTS[i] }}
            />
          ))}
        </div>
        <div
          className="timeline-active-zone"
          style={{ width: `${unlockedPercent}%` }}
        />
        {isPlaying && (
          <div className="timeline-head" style={{ left: `calc(${headPercent}% - 3px)` }} />
        )}
      </div>
    </div>
  );
}
