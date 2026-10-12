import { useEffect, useRef, useState } from "react";
import { db } from "./db";
import { type Book, type Settings } from "./model";
export function usePlayer(
  book: Book | undefined,
  settings: Settings,
  patch: (id: string, p: Partial<Book>) => void,
  next: () => boolean,
  onError: (s: string) => void,
) {
  const audio = useRef(new Audio());
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [length, setLength] = useState(0);
  const [sleepUntil, setSleepUntil] = useState(0);
  const [endSleep, setEndSleep] = useState(false);
  const [ready, setReady] = useState(false);
  const state = useRef({ book, patch, next, onError, endSleep });
  state.current = { book, patch, next, onError, endSleep };
  const lastPause = useRef(Date.now());
  const shouldPlay = useRef(false);
  const loadedKey = useRef("");
  const analysis = useRef<{
    context: AudioContext;
    analyser: AnalyserNode;
    source: MediaElementAudioSourceNode;
    buffer: Float32Array<ArrayBuffer>;
  } | null>(null);
  const activateAnalysis = () => {
    if (!settings.silenceSkip) return;
    if (!("AudioContext" in window)) {
      onError("Silence skipping requires Web Audio support.");
      return;
    }
    try {
      if (!analysis.current) {
        const context = new AudioContext();
        const source = context.createMediaElementSource(audio.current);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        analyser.connect(context.destination);
        analysis.current = {
          context,
          source,
          analyser,
          buffer: new Float32Array(1024),
        };
      }
      void analysis.current.context
        .resume()
        .catch(() =>
          onError("Pause and resume to activate silence detection."),
        );
    } catch (e) {
      onError(`Silence detection unavailable: ${String(e)}`);
    }
  };
  useEffect(() => {
    if (!playing || !settings.silenceSkip) return;
    let quietSince = 0;
    const timer = setInterval(() => {
      const graph = analysis.current,
        a = audio.current,
        b = state.current.book;
      if (
        !graph ||
        !b ||
        a.paused ||
        a.seeking ||
        a.readyState < 3 ||
        settings.volume === 0
      )
        return;
      graph.analyser.getFloatTimeDomainData(graph.buffer);
      const rms = Math.sqrt(
        graph.buffer.reduce((n, v) => n + v * v, 0) / graph.buffer.length,
      );
      if (rms < settings.silenceThreshold) {
        if (!quietSince) quietSince = performance.now();
        if (performance.now() - quietSince >= settings.silenceWindow * 1000) {
          const c = b.chapters[b.chapter],
            end = c.end ?? a.duration;
          a.currentTime = Math.min(end, a.currentTime + 0.3);
          state.current.patch(b.id, {
            position: Math.max(0, a.currentTime - (c.start || 0)),
          });
        }
      } else quietSince = 0;
    }, 100);
    return () => clearInterval(timer);
  }, [
    playing,
    settings.silenceSkip,
    settings.silenceThreshold,
    settings.silenceWindow,
    settings.volume,
  ]);
  useEffect(() => {
    let cancelled = false;
    let url = "";
    const a = audio.current;
    const chapter = book?.chapters[book.chapter];
    setReady(false);
    loadedKey.current = "";
    a.pause();
    a.removeAttribute("src");
    a.load();
    setPosition(book?.position || 0);
    setLength(chapter?.duration || 0);
    if (!chapter?.assetId) return;
    void db.asset(chapter.assetId).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        onError("Audio file is missing. Restore a backup or replace the book.");
        return;
      }
      url = URL.createObjectURL(blob);
      a.src = url;
      a.load();
    });
    return () => {
      cancelled = true;
      loadedKey.current = "";
      a.pause();
      if (url) URL.revokeObjectURL(url);
    };
  }, [book?.id, book?.chapter, book?.chapters[book?.chapter || 0]?.assetId]);
  useEffect(() => {
    const a = audio.current;
    a.playbackRate = settings.speed;
    a.volume = settings.volume;
  }, [settings.speed, settings.volume]);
  useEffect(() => {
    const a = audio.current;
    let advancing = false;
    const bounds = () => {
      const b = state.current.book,
        c = b?.chapters[b.chapter];
      return { start: c?.start || 0, end: c?.end ?? a.duration };
    };
    const isCurrent = () =>
      loadedKey.current ===
      `${state.current.book?.id}:${state.current.book?.chapter}`;
    const loaded = () => {
      loadedKey.current = `${state.current.book?.id}:${state.current.book?.chapter}`;
      setReady(true);
      advancing = false;
      const { start, end } = bounds();
      setLength(end - start);
      const b = state.current.book;
      if (!b) return;
      a.currentTime = start + Math.min(b.position || 0, end - start || 0);
      if (
        Number.isFinite(a.duration) &&
        b.chapters[b.chapter]?.duration !== end - start
      ) {
        const chapters = b.chapters.map((c, i) =>
          i === b.chapter ? { ...c, duration: end - start } : c,
        );
        state.current.patch(b.id, { chapters });
      }
      if (shouldPlay.current) {
        shouldPlay.current = false;
        void a
          .play()
          .catch(() => state.current.onError("Tap play to start audio."));
      }
    };
    const update = () => {
      if (!isCurrent()) return;
      setPosition(Math.max(0, a.currentTime - bounds().start));
      if (
        !advancing &&
        Number.isFinite(bounds().end) &&
        a.currentTime >= bounds().end - 0.05
      ) {
        advancing = true;
        loadedKey.current = ""; // Old pause events must not overwrite the next chapter position.
        a.pause();
        ended();
      }
      if (
        "mediaSession" in navigator &&
        Number.isFinite(a.duration) &&
        a.duration > 0
      )
        try {
          navigator.mediaSession.setPositionState({
            duration: a.duration,
            playbackRate: a.playbackRate,
            position: Math.min(a.currentTime, a.duration),
          });
        } catch {
          /* unsupported position state */
        }
    };
    const play = () => {
      setPlaying(true);
      const b = state.current.book;
      if (b) state.current.patch(b.id, { lastPlayed: Date.now() });
    };
    const pause = () => {
      setPlaying(false);
      if (!isCurrent()) return;
      lastPause.current = Date.now();
      const b = state.current.book;
      if (b)
        state.current.patch(b.id, {
          position: Math.max(0, a.currentTime - bounds().start),
        });
    };
    const ended = () => {
      const { book: b, patch: p, endSleep: stop } = state.current;
      if (!b) return;
      if (b.chapter < b.chapters.length - 1) {
        shouldPlay.current = !stop;
        p(b.id, { chapter: b.chapter + 1, position: 0 });
        if (stop) setEndSleep(false);
      } else {
        p(b.id, { completed: true, position: bounds().end - bounds().start });
        if (!stop) shouldPlay.current = state.current.next();
        else setEndSleep(false);
      }
    };
    const error = () =>
      state.current.onError(
        "This browser cannot decode this audio file. Try MP3 or WAV, or convert locally with FFmpeg.",
      );
    const save = () => {
      const b = state.current.book;
      if (b && a.src && isCurrent())
        state.current.patch(b.id, {
          position: Math.max(0, a.currentTime - bounds().start),
        });
    };
    document.addEventListener("visibilitychange", save);
    window.addEventListener("pagehide", save);
    a.addEventListener("loadedmetadata", loaded);
    a.addEventListener("timeupdate", update);
    a.addEventListener("play", play);
    a.addEventListener("pause", pause);
    const nativeEnded = () => {
      if (!advancing && isCurrent()) {
        advancing = true;
        loadedKey.current = "";
        ended();
      }
    };
    a.addEventListener("ended", nativeEnded);
    a.addEventListener("error", error);
    let previous = performance.now(),
      elapsed = 0;
    const interval = setInterval(() => {
      const now = performance.now();
      const delta = Math.min((now - previous) / 1000, 2);
      previous = now;
      if (
        isCurrent() &&
        !a.paused &&
        !a.ended &&
        !a.seeking &&
        a.readyState >= 3
      ) {
        elapsed += delta;
        void db.listen(delta);
        const b = state.current.book;
        if (b && elapsed >= 5) {
          state.current.patch(b.id, {
            position: Math.max(0, a.currentTime - bounds().start),
            lastPlayed: Date.now(),
          });
          elapsed = 0;
        }
      }
    }, 1000);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", save);
      window.removeEventListener("pagehide", save);
      a.pause();
      a.removeEventListener("loadedmetadata", loaded);
      a.removeEventListener("timeupdate", update);
      a.removeEventListener("play", play);
      a.removeEventListener("pause", pause);
      a.removeEventListener("ended", nativeEnded);
      a.removeEventListener("error", error);
    };
  }, []);
  useEffect(() => {
    if (!sleepUntil) return;
    const id = setInterval(() => {
      if (Date.now() >= sleepUntil) {
        audio.current.pause();
        setSleepUntil(0);
      }
    }, 500);
    return () => clearInterval(id);
  }, [sleepUntil]);
  useEffect(() => {
    if (book && settings.sleep > 0)
      setSleepUntil(Date.now() + settings.sleep * 60000);
  }, [book?.id]);
  const seek = (n: number) => {
    if (!ready) return;
    const a = audio.current;
    const c = book?.chapters[book.chapter],
      start = c?.start || 0,
      end = c?.end ?? a.duration;
    a.currentTime = start + Math.min(Math.max(n, 0), end - start);
    setPosition(a.currentTime - start);
    if (book) patch(book.id, { position: a.currentTime - start });
  };
  const toggle = () => {
    const a = audio.current;
    if (a.paused) {
      if (!ready) {
        onError(
          "This chapter has no playable audio. Generate narration in Voice Studio.",
        );
        return;
      }
      if (Date.now() - lastPause.current > 10000)
        seek(position - settings.rewind);
      activateAnalysis();
      void a.play().catch((e) => onError(e.message));
    } else a.pause();
  };
  useEffect(() => {
    if (!book || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: book.title,
      artist: book.author,
      album: "Folio",
    });
    const actions: [MediaSessionAction, () => void][] = [
      [
        "play",
        () => {
          void audio.current.play().catch(() => {});
        },
      ],
      ["pause", () => audio.current.pause()],
      ["seekbackward", () => seek(position - settings.skip)],
      ["seekforward", () => seek(position + settings.skip)],
      [
        "previoustrack",
        () => {
          if (book.chapter > 0)
            patch(book.id, { chapter: book.chapter - 1, position: 0 });
        },
      ],
      [
        "nexttrack",
        () => {
          if (book.chapter < book.chapters.length - 1)
            patch(book.id, { chapter: book.chapter + 1, position: 0 });
        },
      ],
    ];
    for (const [action, handler] of actions)
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* unsupported action */
      }
    return () => {
      for (const [action] of actions)
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          /* unsupported */
        }
    };
  }, [book?.id, book?.chapter, settings.skip, ready, position]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      }
      if (e.code === "ArrowRight") {
        e.preventDefault();
        seek(position + settings.skip);
      }
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        seek(position - settings.skip);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [ready, settings.skip, settings.rewind, book, position]);
  return {
    playing,
    position,
    length,
    ready,
    toggle,
    seek,
    pause: () => audio.current.pause(),
    skip: (n: number) => seek(position + n),
    sleepUntil,
    endSleep,
    sleep: (minutes: number) => {
      setEndSleep(minutes === -1);
      setSleepUntil(minutes > 0 ? Date.now() + minutes * 60000 : 0);
    },
    changeChapter: (n: number) => {
      if (book && n >= 0 && n < book.chapters.length) {
        shouldPlay.current = playing;
        patch(book.id, { chapter: n, position: 0 });
      }
    },
  };
}
export type Player = ReturnType<typeof usePlayer>;
