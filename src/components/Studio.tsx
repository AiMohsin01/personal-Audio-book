import { useEffect, useRef, useState } from "react";
import { Mic, Play, Pause, Download, Check, RefreshCw } from "lucide-react";
import { db, download } from "../db";

import { time, type Book, type Settings as Preferences } from "../model";

import { Heading } from "./shared";
type Voice = {
  id: string;
  name: string;
  language: string;
  installed: boolean;
  size_mb: number;
  license: string;
  gender: string;
};
type Job = {
  id: string;
  book_id: string;
  source_fingerprint?: string;
  voice: string;
  status: string;
  done: number;
  total: number;
  chapter: number;
  error: string;
  segments: {
    chapter: number;
    chapter_id?: string;
    text_sha256?: string;
    url: string;
    duration: number;
  }[];
};
export default function Studio({
  books,
  selected,
  settings,
  patch,
  message,
}: {
  books: Book[];
  selected: string;
  settings: Preferences;
  patch: (id: string, p: Partial<Book>) => void;
  message: (s: string) => void;
}) {
  const [bookId, setBookId] = useState(
      selected || books.find((b) => b.chapters.some((c) => c.text))?.id || "",
    ),
    [voices, setVoices] = useState<Voice[]>([]),
    [voice, setVoice] = useState(
      books.find((b) => b.id === bookId)?.voice || settings.voice || "",
    ),
    [jobs, setJobs] = useState<Job[]>([]),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false);
  const b = books.find((x) => x.id === bookId);
  const imported = useRef(new Set<string>());
  const previewAudio = useRef<{ audio: HTMLAudioElement; url: string } | null>(
    null,
  );
  const stopPreview = () => {
    if (previewAudio.current) {
      previewAudio.current.audio.pause();
      URL.revokeObjectURL(previewAudio.current.url);
      previewAudio.current = null;
    }
  };
  useEffect(() => () => stopPreview(), []);
  const booksRef = useRef(books);
  booksRef.current = books;
  const base = settings.companion.replace(/\/$/, "");
  const request = async (path: string, options?: RequestInit) => {
    const res = await fetch(base + path, {
      ...options,
      signal:
        options?.signal ||
        AbortSignal.timeout(
          path.endsWith("/install")
            ? 600000
            : path === "/voices" || path === "/jobs"
              ? 15000
              : 60000,
        ),
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
    if (!res.ok) {
      let text = await res.text();
      try {
        text = JSON.parse(text).detail || text;
      } catch {}
      throw Error(text);
    }
    return res.json();
  };
  useEffect(() => {
    let gone = false;
    let working = false;
    const poll = async () => {
      if (working) return;
      working = true;
      try {
        const [v, j] = await Promise.all([
          request("/voices"),
          request("/jobs"),
        ]);
        if (gone) return;
        setConnected(true);
        setVoices(v);
        setJobs(
          (j as Job[]).filter((job) =>
            booksRef.current.some((b) => b.id === job.book_id),
          ),
        );
        for (const job of j as Job[])
          if (job.status === "completed" && !imported.current.has(job.id)) {
            const book = booksRef.current.find((x) => x.id === job.book_id);
            if (
              !book ||
              book.generatedJobs?.includes(job.id) ||
              (job.source_fingerprint &&
                job.source_fingerprint !== book.fingerprint)
            )
              continue;
            imported.current.add(job.id);
            try {
              const chapters = [...book.chapters];
              let saved = 0;
              for (const seg of job.segments) {
                const index = seg.chapter_id
                  ? chapters.findIndex((c) => c.id === seg.chapter_id)
                  : seg.chapter;
                if (!chapters[index]) continue;
                if (seg.text_sha256) {
                  const hash = Array.from(
                    new Uint8Array(
                      await crypto.subtle.digest(
                        "SHA-256",
                        new TextEncoder().encode(chapters[index].text || ""),
                      ),
                    ),
                  )
                    .map((x) => x.toString(16).padStart(2, "0"))
                    .join("");
                  if (hash !== seg.text_sha256) continue;
                }

                const res = await fetch(base + seg.url);
                if (!res.ok)
                  throw Error("Could not retrieve generated chapter");
                const blob = await res.blob();
                const id = `piper:${job.id}:${seg.chapter}`;
                await db.asset(id, blob);
                saved++;
                chapters[index] = {
                  ...chapters[index],
                  assetId: id,
                  duration: seg.duration,
                };
              }
              patch(book.id, {
                chapters,
                voice: job.voice,
                generatedJobs: [...(book.generatedJobs || []), job.id],
              });
              message(
                saved
                  ? "Narration saved to your library"
                  : "Book text has changed. Generate a new narration job.",
              );
            } catch (e) {
              imported.current.delete(job.id);
              message(String(e));
            }
          }
      } catch {
        if (!gone) setConnected(false);
      } finally {
        working = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [base]);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      message(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading
        eyebrow="GIVE YOUR BOOKS A VOICE"
        title="Voice studio"
        subtitle="Natural narration. Generated on your computer. Yours to keep."
      />
      <div className="studio-status">
        <span className={connected ? "status-dot" : "status-dot off"} />
        <div>
          <strong>
            {connected
              ? "Local companion connected"
              : "Start your local companion"}
          </strong>
          <p>
            {connected
              ? "Piper runs entirely on this computer. No text leaves your device."
              : "Run .venv/bin/uvicorn companion.app:app --host 127.0.0.1 --port 8765 from the project folder. See README for installation."}
          </p>
        </div>
        <Mic size={24} />
      </div>
      <div className="two-columns">
        <section className="panel">
          <h3>1. Choose your book</h3>
          <label className="field">
            Book
            <select
              value={bookId}
              onChange={(e) => {
                setBookId(e.target.value);
                setVoice(
                  books.find((b) => b.id === e.target.value)?.voice ||
                    settings.voice ||
                    "",
                );
              }}
            >
              <option value="">Select a text book</option>
              {books
                .filter((b) => b.chapters.some((c) => c.text))
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
            </select>
          </label>
          {b && (
            <p className="muted">
              {b.chapters.filter((c) => c.text?.trim()).length} readable
              chapters ·{" "}
              {b.chapters
                .reduce((n, c) => n + (c.text?.length || 0), 0)
                .toLocaleString()}{" "}
              characters
            </p>
          )}
          <label className="field">
            Voice
            <select
              value={voice || b?.voice || ""}
              onChange={(e) => setVoice(e.target.value)}
            >
              <option value="">Choose an installed voice</option>
              {voices
                .filter((v) => v.installed)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.language}
                  </option>
                ))}
            </select>
          </label>
          <div className="button-row">
            <button
              disabled={!connected || !voice || busy}
              onClick={() =>
                void act(async () => {
                  const res = await fetch(base + "/preview", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      voice,
                      text: "Take a moment. A good story is waiting for you.",
                      speed: settings.speed,
                    }),
                  });
                  if (!res.ok) throw Error(await res.text());
                  const u = URL.createObjectURL(await res.blob());
                  stopPreview();
                  const a = new Audio(u);
                  previewAudio.current = { audio: a, url: u };
                  a.onended = () => stopPreview();
                  a.onerror = () => {
                    stopPreview();
                    message("Preview playback failed");
                  };
                  await a.play();
                })
              }
            >
              <Play size={16} />
              Preview voice
            </button>
            <button
              className="primary"
              disabled={!connected || !b || !voice || busy}
              onClick={() =>
                void act(async () => {
                  await request("/jobs", {
                    method: "POST",
                    body: JSON.stringify({
                      book_id: b!.id,
                      source_fingerprint: b!.fingerprint,
                      voice,
                      speed: settings.speed,
                      chapters: b!.chapters.map((c, i) => ({
                        id: c.id,
                        index: i,
                        title: c.title,
                        text: c.text || "",
                      })),
                    }),
                  });
                  patch(b!.id, { voice });
                  message("Conversion queued. You can pause and resume below.");
                })
              }
            >
              <Mic size={16} />
              Generate audiobook
            </button>
          </div>
          <p className="notice">
            Generation uses {settings.speed}× narration speed. Finished chapters
            are kept by the companion; completed books also copy into browser
            storage. Keep the companion running during conversion.
          </p>
        </section>
        <section className="panel">
          <h3>2. Local voice models</h3>
          <p className="muted">
            Downloads only happen when you select Install. Models need roughly
            their download size on disk, plus runtime memory.
          </p>
          {voices.map((v) => (
            <div className="voice-card" key={v.id}>
              <div>
                <strong>{v.name}</strong>
                <span>
                  {v.language} · {v.gender} · {v.size_mb} MB
                </span>
                <small>{v.license}</small>
              </div>
              {v.installed ? (
                <span className="installed">
                  <Check size={15} />
                  Installed
                </span>
              ) : (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const license = await request(
                        "/voices/" + v.id + "/license",
                      );
                      if (
                        confirm(
                          `Model card:\n${license.card}\n\nDownload ${v.name}: approximately ${v.size_mb} MB; reserve ${v.size_mb + 10} MB disk space and ~500 MB RAM. Download from Hugging Face now?`,
                        )
                      ) {
                        await request("/voices/" + v.id + "/install", {
                          method: "POST",
                        });
                        message("Voice installed");
                      }
                    })
                  }
                >
                  Install <Download size={15} />
                </button>
              )}
            </div>
          ))}
          {!connected && (
            <p>Voice choices will appear when the companion connects.</p>
          )}
          <p className="notice">
            Advanced: place matching .onnx and .onnx.json files plus a
            .license.txt file in .local/voices, then restart the companion. You
            must check each model’s license and language yourself.
          </p>
        </section>
      </div>
      <section className="panel">
        <h3>Conversion jobs</h3>
        {jobs.length ? (
          jobs.map((j) => (
            <div className="conversion-job" key={j.id}>
              <div className="section-heading">
                <div>
                  <strong>
                    {books.find((b) => b.id === j.book_id)?.title || j.book_id}
                  </strong>
                  <p>
                    {j.status} · {j.done} / {j.total} text chunks · Chapter{" "}
                    {j.chapter + 1}
                  </p>
                </div>
                <div className="button-row">
                  {["running", "queued"].includes(j.status) && (
                    <button
                      onClick={() =>
                        void act(() =>
                          request("/jobs/" + j.id + "/pause", {
                            method: "POST",
                          }),
                        )
                      }
                    >
                      <Pause size={16} />
                      Pause
                    </button>
                  )}
                  {["paused", "failed"].includes(j.status) && (
                    <button
                      onClick={() =>
                        void act(() =>
                          request("/jobs/" + j.id + "/resume", {
                            method: "POST",
                          }),
                        )
                      }
                    >
                      <Play size={16} />
                      {j.status === "failed" ? "Retry" : "Resume"}
                    </button>
                  )}
                  {j.status === "completed" && (
                    <button
                      onClick={() => {
                        imported.current.delete(j.id);
                        const target = books.find((b) => b.id === j.book_id);
                        if (target)
                          patch(target.id, {
                            generatedJobs: target.generatedJobs?.filter(
                              (id) => id !== j.id,
                            ),
                          });
                        message("Will reimport on next status update");
                      }}
                    >
                      <RefreshCw size={16} />
                      Reimport audio
                    </button>
                  )}
                </div>
              </div>
              <progress value={j.done} max={j.total || 1} />
              {j.error && <p className="error-text">{j.error}</p>}
              {j.segments.map((seg) => (
                <button
                  key={seg.chapter}
                  className="text-button"
                  onClick={async () => {
                    try {
                      const r = await fetch(base + seg.url);
                      if (!r.ok) throw Error("Audio download failed");
                      download(
                        await r.blob(),
                        `chapter-${seg.chapter + 1}.wav`,
                      );
                    } catch (e) {
                      message(String(e));
                    }
                  }}
                >
                  <Download size={14} />
                  Chapter {seg.chapter + 1} · {time(seg.duration)}
                </button>
              ))}
            </div>
          ))
        ) : (
          <p className="muted">
            Your conversion jobs will appear here. Progress reports completed
            text chunks; pausing takes effect after the current chunk.
          </p>
        )}
      </section>
      <p className="notice">
        Piper engine: GPL-3.0. Voices have separate licenses. No paid API or
        account. Optional scanned-PDF OCR: install OCRmyPDF and Tesseract, then
        run <code>ocrmypdf input.pdf searchable.pdf</code> locally and import
        the result. Exact word timings are not implemented; live reading
        highlights the current sentence only. Experimental measured silence
        skipping is opt-in under Settings.
      </p>
    </>
  );
}
