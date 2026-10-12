import { useRef, useState } from "react";
import {
  BookOpen,
  Mic,
  Plus,
  Play,
  Heart,
  MoreHorizontal,
  List,
  Download,
  Trash2,
  Check,
  RefreshCw,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { db, download } from "../db";
import { importFile } from "../import";
import {
  duration,
  progress,
  time,
  uid,
  changeChapters,
  type Book,
} from "../model";

import { Cover, Heading } from "./shared";

export default function Details({
  book: b,
  patch,
  collections,
  listen,
  read,
  studio,
  remove,
  enqueue,
  message,
}: {
  book: Book;
  patch: (p: Partial<Book>) => void;
  collections: string[];
  listen: () => void;
  read: () => void;
  studio: () => void;
  remove: () => void;
  enqueue: () => void;
  message: (s: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: b.title,
    author: b.author,
    description: b.description,
    category: b.category,
  });
  const cover = useRef<HTMLInputElement>(null);
  const replacement = useRef<HTMLInputElement>(null);
  return (
    <>
      <Heading
        eyebrow="ON YOUR SHELF"
        title="Book details"
        subtitle="A story to make your own."
      />
      <div className="detail-layout">
        <div>
          <Cover book={b} />
          <button
            className="text-button"
            onClick={() => cover.current?.click()}
          >
            Change cover
          </button>
          <input
            hidden
            ref={cover}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) patch({ cover: f });
            }}
          />
        </div>
        <div>
          <span className="pill">
            {b.format} · {b.category}
          </span>
          {editing ? (
            <form
              className="metadata-form"
              onSubmit={(e) => {
                e.preventDefault();
                patch(form);
                setEditing(false);
              }}
            >
              <label>
                Title
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label>
                Author
                <input
                  value={form.author}
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                />
              </label>
              <label>
                Genre / category
                <input
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
              <button className="primary">Save metadata</button>
              <button type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <>
              <h2 className="book-detail-title">{b.title}</h2>
              <p className="author">by {b.author}</p>
              <p>
                {b.description ||
                  "Add a description to tell the story behind this book."}
              </p>
              <button
                className="text-button"
                onClick={() => {
                  setForm({
                    title: b.title,
                    author: b.author,
                    description: b.description,
                    category: b.category,
                  });
                  setEditing(true);
                }}
              >
                Edit metadata <MoreHorizontal size={16} />
              </button>
            </>
          )}
          <div className="detail-facts">
            <span>
              <strong>{b.chapters.length}</strong> chapters / pages
            </span>
            <span>
              <strong>{duration(b) ? time(duration(b)) : "—"}</strong> audio
              duration
            </span>
            <span>
              <strong>{Math.round(progress(b))}%</strong> listened
            </span>
          </div>
          <div className="button-row">
            <button className="primary" onClick={listen}>
              <Play size={17} /> Listen
            </button>
            {b.chapters.some((c) => c.text) && (
              <button className="secondary" onClick={read}>
                <BookOpen size={17} /> Read
              </button>
            )}
            {b.chapters.some((c) => c.text) && (
              <button className="secondary" onClick={studio}>
                <Mic size={17} /> Narrate
              </button>
            )}
          </div>
          <div className="button-row">
            <button onClick={() => patch({ favorite: !b.favorite })}>
              <Heart size={17} fill={b.favorite ? "currentColor" : "none"} />
              {b.favorite ? "Favorited" : "Favorite"}
            </button>
            <button onClick={enqueue}>
              <List size={17} />
              Add to queue
            </button>
            <button onClick={() => patch({ completed: !b.completed })}>
              <Check size={17} />
              {b.completed ? "Mark unfinished" : "Mark completed"}
            </button>
          </div>
          <label className="field">
            Collection
            <select
              value={b.collection}
              onChange={(e) => patch({ collection: e.target.value })}
            >
              <option value="">No collection</option>
              {collections.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <button
              onClick={async () => {
                const blob =
                  (await db.asset(`${b.id}:source`)) ||
                  (await db.asset(b.chapters[0]?.assetId || ""));
                if (blob)
                  download(blob, `${b.title}.${b.format.toLowerCase()}`);
                else
                  message(
                    "Source unavailable; export generated chapters below.",
                  );
              }}
            >
              <Download size={16} />
              Export original
            </button>
            <button onClick={() => replacement.current?.click()}>
              <RefreshCw size={16} />
              Replace file
            </button>
            <button className="danger" onClick={remove}>
              <Trash2 size={16} />
              Delete book
            </button>
          </div>
          <input
            hidden
            type="file"
            ref={replacement}
            accept=".pdf,.epub,.mp3,.m4b,.wav,.flac,.m4a,.ogg"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const fresh = await importFile(f, () => {});
                const previous = { ...b };
                patch({
                  chapters: fresh.chapters,
                  fingerprint: fresh.fingerprint,
                  size: fresh.size,
                  format: fresh.format,
                  chapter: 0,
                  position: 0,
                  readerChapter: 0,
                  readerPosition: 0,
                  marks: [],
                  completed: false,
                });
                await db.deleteRecord(fresh.id);
                await db.deleteAsset(`${b.id}:source`);
                const source = await db.asset(`${fresh.id}:source`);
                if (source) {
                  await db.asset(`${b.id}:source`, source);
                  await db.deleteAsset(`${fresh.id}:source`);
                }
                for (const c of previous.chapters)
                  if (c.assetId) await db.deleteAsset(c.assetId);
                message(
                  "Book file replaced; progress and chapter notes reset.",
                );
              } catch (err) {
                message(String(err));
              }
              e.target.value = "";
            }}
          />
        </div>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h3>Chapters</h3>
          <button
            onClick={() => {
              const title = prompt("New chapter title:");
              if (title)
                patch({
                  chapters: [...b.chapters, { id: uid(), title, text: "" }],
                });
            }}
          >
            <Plus size={16} />
            Add chapter
          </button>
        </div>
        {b.chapters.map((c, i) => (
          <div className="chapter-row" key={c.id}>
            <span>{i + 1}</span>
            <button
              className="chapter-title"
              onClick={() => {
                const title = prompt("Chapter title:", c.title);
                if (title)
                  patch({
                    chapters: b.chapters.map((x, n) =>
                      n === i ? { ...x, title } : x,
                    ),
                  });
              }}
            >
              {c.title}
            </button>
            {c.text !== undefined && (
              <button
                onClick={() => {
                  const text = prompt("Edit chapter text:", c.text);
                  if (text !== null)
                    patch({
                      chapters: b.chapters.map((x, n) =>
                        n === i ? { ...x, text } : x,
                      ),
                    });
                }}
              >
                Edit text
              </button>
            )}
            {c.assetId && (
              <button
                aria-label={
                  c.assetId?.startsWith("piper:")
                    ? `Export ${c.title}`
                    : `Export source for ${c.title}`
                }
                onClick={async () => {
                  const blob = await db.asset(c.assetId!);
                  if (blob)
                    download(
                      blob,
                      c.assetId?.startsWith("piper:")
                        ? `${b.title}-${i + 1}.wav`
                        : `${b.title}.${b.format.toLowerCase()}`,
                    );
                }}
              >
                <Download size={16} />
              </button>
            )}
            <button
              aria-label={`Move ${c.title} up`}
              disabled={i === 0}
              onClick={() => {
                const chapters = [...b.chapters];
                [chapters[i - 1], chapters[i]] = [chapters[i], chapters[i - 1]];
                patch(changeChapters(b, chapters));
              }}
            >
              <ArrowUp size={15} />
            </button>
            <button
              aria-label={`Move ${c.title} down`}
              disabled={i === b.chapters.length - 1}
              onClick={() => {
                const chapters = [...b.chapters];
                [chapters[i + 1], chapters[i]] = [chapters[i], chapters[i + 1]];
                patch(changeChapters(b, chapters));
              }}
            >
              <ArrowDown size={15} />
            </button>
            {c.assetId && c.text === undefined && (
              <button
                onClick={() => {
                  const answer = prompt(
                    "Split this chapter at how many seconds from its start?",
                  );
                  if (answer === null) return;
                  const offset = Number(answer);
                  if (
                    !Number.isFinite(offset) ||
                    offset <= 0 ||
                    offset >= (c.duration || 0)
                  ) {
                    message("Choose a time within this chapter.");
                    return;
                  }
                  const start = c.start || 0,
                    end = c.end ?? start + (c.duration || 0);
                  const next = {
                    ...c,
                    id: uid(),
                    title: c.title + " · Part 2",
                    start: start + offset,
                    end,
                    duration: end - start - offset,
                  };
                  const chapters = [...b.chapters];
                  chapters.splice(
                    i,
                    1,
                    { ...c, end: start + offset, duration: offset },
                    next,
                  );
                  const changes = changeChapters(b, chapters);
                  changes.marks = (changes.marks || []).map((m) =>
                    m.chapter === i &&
                    m.position >= offset &&
                    !["reading", "highlight"].includes(m.kind)
                      ? { ...m, chapter: i + 1, position: m.position - offset }
                      : m,
                  );
                  if (b.chapter === i && b.position >= offset) {
                    changes.chapter = i + 1;
                    changes.position = b.position - offset;
                  }
                  patch(changes);
                }}
              >
                Split audio
              </button>
            )}
            <button
              aria-label={`Remove chapter ${c.title}`}
              className="danger"
              disabled={b.chapters.length === 1}
              onClick={async () => {
                if (!confirm(`Remove chapter “${c.title}” and its notes?`))
                  return;
                const chapters = b.chapters.filter((_, n) => n !== i);
                patch(changeChapters(b, chapters));
                if (c.assetId && !chapters.some((x) => x.assetId === c.assetId))
                  await db.deleteAsset(c.assetId);
              }}
            >
              <Trash2 size={15} />
            </button>
            <small>{time(c.duration || 0)}</small>
          </div>
        ))}
      </section>
    </>
  );
}
