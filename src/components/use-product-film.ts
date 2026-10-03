import { useEffect, useRef, useState } from "react";

/** One viewing, a held payoff, and deliberate replay. Never loops. */
export function useProductFilm() {
  const video = useRef<HTMLVideoElement>(null);
  const visible = useRef(false);
  const manualPause = useRef(false);
  const completed = useRef(false);
  const reduced = useRef(true);
  const manualMotion = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [posterVisible, setPosterVisible] = useState(true);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    let mounted = true;
    const play = () => {
      if (!visible.current || document.hidden || manualPause.current || completed.current || (reduced.current && !manualMotion.current)) return;
      void element.play().catch(() => { if (mounted) setPlaying(false); });
    };
    const syncPreference = () => {
      reduced.current = query.matches;
      manualMotion.current = false;
      if (query.matches) { element.pause(); setPosterVisible(true); }
      else play();
    };
    const syncVisibility = () => { if (document.hidden) element.pause(); else play(); };
    const onPlay = () => { setPlaying(true); setFailed(false); setPosterVisible(false); };
    const onPause = () => setPlaying(false);
    const onEnded = () => { completed.current = true; setEnded(true); setPlaying(false); };
    const onError = () => { setFailed(true); setPlaying(false); setPosterVisible(true); };
    const closeFullscreen = () => { if (!document.fullscreenElement) element.controls = false; };
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = Boolean(entry?.isIntersecting && entry.intersectionRatio >= .5);
      if (visible.current) play(); else element.pause();
    }, { threshold: [0, .5] });
    element.addEventListener("play", onPlay);
    element.addEventListener("pause", onPause);
    element.addEventListener("ended", onEnded);
    element.addEventListener("error", onError);
    document.addEventListener("visibilitychange", syncVisibility);
    document.addEventListener("fullscreenchange", closeFullscreen);
    query.addEventListener("change", syncPreference);
    syncPreference();
    observer.observe(element);
    return () => {
      mounted = false;
      observer.disconnect();
      query.removeEventListener("change", syncPreference);
      document.removeEventListener("visibilitychange", syncVisibility);
      document.removeEventListener("fullscreenchange", closeFullscreen);
      element.removeEventListener("play", onPlay);
      element.removeEventListener("pause", onPause);
      element.removeEventListener("ended", onEnded);
      element.removeEventListener("error", onError);
      element.pause();
    };
  }, []);

  function toggle() {
    const element = video.current;
    if (!element) return;
    if (!element.paused && !element.ended) { manualPause.current = true; element.pause(); return; }
    if (completed.current || element.ended) { element.currentTime = 0; completed.current = false; setEnded(false); }
    if (failed) { element.load(); setFailed(false); }
    manualPause.current = false;
    manualMotion.current = true;
    void element.play().catch(() => setPlaying(false));
  }

  function expand() {
    const element = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!element) return;
    element.controls = true;
    if (element.requestFullscreen) void element.requestFullscreen().catch(() => { element.controls = false; });
    else if (element.webkitEnterFullscreen) element.webkitEnterFullscreen();
  }

  return { video, playing, ended, failed, posterVisible, toggle, expand };
}
