import { useEffect, useRef, useState } from "react";
import { Mic, Bookmark, Search, Play, Pause, ChevronRight } from "lucide-react";

import { uid, type Book, type Settings as Preferences } from "../model";

import { Heading } from "./shared";
export default function Reader({
  book: b,
  settings: s,
  preferences,
  patch,
  message,
}: {
  book: Book;
  settings: Preferences;
  preferences: (p: Partial<Preferences>) => void;
  patch: (p: Partial<Book>) => void;
  message: (s: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]),
    [voice, setVoice] = useState(""),
    [speaking, setSpeaking] = useState(false),
    [paused, setPaused] = useState(false),
    [spoken, setSpoken] = useState(-1);
  const content = useRef<HTMLDivElement>(null);
  const chapter = b.chapters[b.readerChapter];
  const index = useRef(0);
  const pieces = (chapter?.text || "").match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const cancel = () => {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
    setSpoken(-1);
  };
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const update = () => setVoices(speechSynthesis.getVoices());
    update();
    speechSynthesis.addEventListener("voiceschanged", update);
    return () => {
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      speechSynthesis.removeEventListener("voiceschanged", update);
    };
  }, []);
  useEffect(() => {
    cancel();
    if (content.current) content.current.scrollTop = b.readerPosition;
  }, [b.readerChapter, b.id]);
  const speak = (i: number) => {
    if (i >= pieces.length) {
      setSpeaking(false);
      setSpoken(-1);
      return;
    }
    index.current = i;
    setSpoken(i);
    const u = new SpeechSynthesisUtterance(pieces[i]);
    u.voice = voices.find((v) => v.voiceURI === voice) || null;
    u.rate = s.speed;
    u.onend = () => speak(i + 1);
    u.onerror = (e) => {
      if (e.error !== "interrupted" && e.error !== "canceled") {
        message(`Live reading failed: ${e.error}`);
        setSpeaking(false);
      }
    };
    speechSynthesis.speak(u);
  };
  const toggle = () => {
    if (!("speechSynthesis" in window)) {
      message(
        "This browser has no live speech synthesis. Use Piper in Voice Studio.",
      );
      return;
    }
    if (speaking) {
      if (paused) {
        speechSynthesis.resume();
        setPaused(false);
      } else {
        speechSynthesis.pause();
        setPaused(true);
      }
    } else {
      setSpeaking(true);
      speak(0);
    }
  };
  const highlight = () => {
    const sel = window.getSelection();
    if (!sel?.toString().trim() || !content.current?.contains(sel.anchorNode)) {
      message("Select text in the reading pane first.");
      return;
    }
    patch({
      marks: [
        ...b.marks,
        {
          id: uid(),
          chapter: b.readerChapter,
          position: content.current.scrollTop,
          text: sel.toString(),
          kind: "highlight",
          created: Date.now(),
        },
      ],
    });
    message("Highlight saved");
  };
  return (
    <>
      <Heading
        eyebrow="THE READING ROOM"
        title={b.title}
        subtitle={`by ${b.author}`}
      />
      <div className="reader-toolbar">
        <select
          aria-label="Reading chapter"
          value={b.readerChapter}
          onChange={(e) =>
            patch({ readerChapter: Number(e.target.value), readerPosition: 0 })
          }
        >
          {b.chapters.map((c, i) => (
            <option key={c.id} value={i}>
              {c.title}
            </option>
          ))}
        </select>
        <label className="search">
          <Search size={16} />
          <input
            placeholder="Find in this book…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          onClick={() => {
            patch({
              marks: [
                ...b.marks,
                {
                  id: uid(),
                  chapter: b.readerChapter,
                  position: content.current?.scrollTop || 0,
                  text: chapter?.title || "Reading position",
                  kind: "reading",
                  created: Date.now(),
                },
              ],
            });
            message("Reading bookmark saved");
          }}
        >
          <Bookmark size={16} />
          Bookmark page
        </button>
        <button onClick={highlight}>
          <Bookmark size={16} />
          Save highlight
        </button>
      </div>
      {query && (
        <div className="search-results">
          {b.chapters
            .filter((c) => c.text?.toLowerCase().includes(query.toLowerCase()))
            .map((c) => (
              <button
                key={c.id}
                onClick={() =>
                  patch({
                    readerChapter: b.chapters.indexOf(c),
                    readerPosition: 0,
                  })
                }
              >
                {c.title} <ChevronRight size={14} />
              </button>
            ))}
        </div>
      )}
      <div className="reader-options">
        <label>
          Size
          <input
            aria-label="Reading font size"
            type="range"
            min="14"
            max="36"
            value={s.readerSize}
            onChange={(e) =>
              preferences({ readerSize: Number(e.target.value) })
            }
          />
        </label>
        <select
          aria-label="Reading font"
          value={s.readerFont}
          onChange={(e) => preferences({ readerFont: e.target.value })}
        >
          <option>Georgia</option>
          <option>system-ui</option>
          <option>monospace</option>
        </select>
        <select
          aria-label="Reading background"
          value={s.readerTheme}
          onChange={(e) => preferences({ readerTheme: e.target.value })}
        >
          <option value="paper">Paper</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
        <label>
          Spacing
          <input
            type="range"
            aria-label="Line spacing"
            min="1.2"
            max="2.5"
            step="0.1"
            value={s.readerSpacing}
            onChange={(e) =>
              preferences({ readerSpacing: Number(e.target.value) })
            }
          />
        </label>
      </div>
      <div
        ref={content}
        className={`reader-content ${s.readerTheme}`}
        style={{
          fontSize: s.readerSize,
          fontFamily: s.readerFont,
          lineHeight: s.readerSpacing,
        }}
        onScroll={(e) => patch({ readerPosition: e.currentTarget.scrollTop })}
      >
        <h2>{chapter?.title}</h2>
        {chapter?.text ? (
          pieces.map((p, i) => {
            const marks = b.marks.filter(
              (m) => m.kind === "highlight" && m.chapter === b.readerChapter,
            );
            const highlighted = marks.some((m) => p.includes(m.text));
            return (
              <span
                key={i}
                className={
                  i === spoken ? "spoken" : highlighted ? "highlighted" : ""
                }
              >
                {query && p.toLowerCase().includes(query.toLowerCase()) ? (
                  <mark>{p}</mark>
                ) : (
                  p
                )}
              </span>
            );
          })
        ) : (
          <p>
            No extractable text on this page. For scanned PDFs, run optional
            offline OCR in the companion, then import the searchable PDF.
          </p>
        )}
      </div>
      <div className="reader-live">
        <div>
          <Mic size={18} />
          <strong>Browser live reading</strong>
          <small>
            Uses your device’s voices. Offline availability varies. Cannot
            export audio.
          </small>
        </div>
        <select
          aria-label="Browser voice"
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
        >
          <option value="">Device default</option>
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} · {v.lang}
              {v.localService ? " · local" : ""}
            </option>
          ))}
        </select>
        <button className="primary" onClick={toggle}>
          {speaking && !paused ? <Pause size={16} /> : <Play size={16} />}{" "}
          {speaking ? (paused ? "Resume" : "Pause") : "Read aloud"}
        </button>
        <button onClick={cancel}>Stop</button>
      </div>
    </>
  );
}
