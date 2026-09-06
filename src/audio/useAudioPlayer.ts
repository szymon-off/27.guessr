import { useCallback, useEffect, useRef, useState } from 'react';
import { readJson, writeJson } from '../storage/store';

interface Graph {
  context: AudioContext;
  analyser: AnalyserNode;
  gain: GainNode;
}

export interface AudioPlayer {
  isPlaying: boolean;
  /** 0…1 across the currently unlocked snippet, for the timeline head. */
  progress: number;
  ready: boolean;
  error: string | null;
  volume: number;
  setVolume: (value: number) => void;
  /** Play from the start and stop after `limit` seconds. */
  play: (limit: number) => void;
  stop: () => void;
  toggle: (limit: number) => void;
  analyser: AnalyserNode | null;
}

/**
 * Owns the single <audio> element the whole game plays through, routed via Web
 * Audio so the waveform has something to visualise.
 *
 * Snippets are as short as 0.1 s, which `timeupdate` (fired every ~250 ms) is
 * far too coarse to bound — so playback is stopped from a requestAnimationFrame
 * loop that also drives the progress read-out.
 */
export function useAudioPlayer(src: string | null): AudioPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const frameRef = useRef<number | null>(null);
  const limitRef = useRef(0);

  const [isPlaying, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(() => readJson<number>('volume', 0.8));
  // Held in state, not just a ref, so the waveform re-renders once the graph exists.
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  if (audioRef.current === null && typeof Audio !== 'undefined') {
    const el = new Audio();
    // Required for Web Audio to read the samples; Apple's preview CDN sends
    // access-control-allow-origin: *, so the request stays untainted.
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    audioRef.current = el;
  }

  /**
   * The AudioContext is built on the first play, not on mount: browsers start
   * contexts suspended unless they are created inside a user gesture.
   */
  const ensureGraph = useCallback((): Graph | null => {
    const audio = audioRef.current;
    if (!audio) return null;
    if (graphRef.current) return graphRef.current;

    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null; // no Web Audio — plain playback still works

    try {
      const context = new Ctor();
      const source = context.createMediaElementSource(audio);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      const gain = context.createGain();
      gain.gain.value = 1;
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(context.destination);
      graphRef.current = { context, analyser, gain };
      setAnalyser(analyser);
      return graphRef.current;
    } catch {
      return null;
    }
  }, []);

  const cancelFrame = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    cancelFrame();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaying(false);
    setProgress(0);
  }, [cancelFrame]);

  const play = useCallback(
    (limit: number) => {
      const audio = audioRef.current;
      if (!audio || !src) return;
      limitRef.current = limit;
      ensureGraph()?.context.resume().catch(() => undefined);

      audio.currentTime = 0;
      setError(null);
      void audio
        .play()
        .then(() => {
          setPlaying(true);
          const tick = () => {
            const elapsed = audio.currentTime;
            if (elapsed >= limitRef.current) {
              audio.pause();
              audio.currentTime = 0;
              setPlaying(false);
              setProgress(0);
              frameRef.current = null;
              return;
            }
            setProgress(Math.min(1, elapsed / limitRef.current));
            frameRef.current = requestAnimationFrame(tick);
          };
          cancelFrame();
          frameRef.current = requestAnimationFrame(tick);
        })
        .catch(() => {
          setPlaying(false);
          setError('Nie udało się odtworzyć fragmentu.');
        });
    },
    [cancelFrame, ensureGraph, src],
  );

  const toggle = useCallback(
    (limit: number) => {
      if (isPlaying) stop();
      else play(limit);
    },
    [isPlaying, play, stop],
  );

  const setVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    setVolumeState(clamped);
    writeJson('volume', clamped);
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Swap the source when the round changes, and reset everything with it.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    cancelFrame();
    audio.pause();
    setPlaying(false);
    setProgress(0);
    setReady(false);
    setError(null);
    if (!src) return;

    const onReady = () => setReady(true);
    const onError = () => setError('Nie udało się wczytać fragmentu.');
    audio.addEventListener('canplaythrough', onReady);
    audio.addEventListener('loadeddata', onReady);
    audio.addEventListener('error', onError);
    audio.src = src;
    audio.load();
    return () => {
      audio.removeEventListener('canplaythrough', onReady);
      audio.removeEventListener('loadeddata', onReady);
      audio.removeEventListener('error', onError);
    };
  }, [src, cancelFrame]);

  useEffect(
    () => () => {
      cancelFrame();
      audioRef.current?.pause();
      void graphRef.current?.context.close().catch(() => undefined);
    },
    [cancelFrame],
  );

  return {
    isPlaying,
    progress,
    ready,
    error,
    volume,
    setVolume,
    play,
    stop,
    toggle,
    analyser,
  };
}
