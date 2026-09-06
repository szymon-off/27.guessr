import { useEffect, useRef } from 'react';
import { Music } from 'lucide-react';

interface Props {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}

/**
 * Live frequency bars while a snippet plays, and the original's quiet music-note
 * placeholder when it doesn't. Falls back to a static bar pattern if the browser
 * gave us no analyser, so the panel is never an empty box.
 */
export function Waveform({ analyser, isPlaying }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const styles = getComputedStyle(canvas);
    const accent = styles.getPropertyValue('--accent').trim() || '#3b82f6';
    const idle = styles.getPropertyValue('--waveform-idle-bar').trim() || 'rgba(255,255,255,.08)';

    const bins = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const BAR_COUNT = 56;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (analyser && bins && isPlaying) analyser.getByteFrequencyData(bins);

      const barWidth = w / BAR_COUNT;
      ctx.fillStyle = isPlaying ? accent : idle;
      for (let i = 0; i < BAR_COUNT; i++) {
        let level: number;
        if (analyser && bins && isPlaying) {
          // Spread the bars across the useful part of the spectrum; the top
          // bins of a 30 s AAC preview are mostly silence.
          const index = Math.floor((i / BAR_COUNT) ** 1.4 * bins.length * 0.7);
          level = bins[index] / 255;
        } else {
          // A calm, deterministic idle shape rather than a flat line.
          level = 0.12 + 0.1 * Math.abs(Math.sin(i * 0.55));
        }
        const barHeight = Math.max(2 * dpr, level * h * 0.92);
        ctx.fillRect(
          i * barWidth + barWidth * 0.18,
          (h - barHeight) / 2,
          barWidth * 0.64,
          barHeight,
        );
      }

      frameRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [analyser, isPlaying]);

  return (
    <div className="waveform-wrap">
      <canvas ref={canvasRef} className="waveform-canvas" aria-hidden="true" />
      {!isPlaying && (
        <div className="waveform-idle">
          <Music className="waveform-idle-icon" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
