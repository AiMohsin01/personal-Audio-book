export type Chapter = {
  id: string;
  title: string;
  text?: string;
  assetId?: string;
  duration?: number;
  start?: number;
  end?: number;
};
export type Mark = {
  id: string;
  chapter: number;
  position: number;
  text: string;
  kind: "bookmark" | "note" | "highlight" | "reading";
  created: number;
};
export type Book = {
  id: string;
  title: string;
  author: string;
  description: string;
  category: string;
  added: number;
  lastPlayed: number;
  favorite: boolean;
  completed: boolean;
  collection: string;
  cover?: Blob;
  chapters: Chapter[];
  position: number;
  chapter: number;
  readerChapter: number;
  readerPosition: number;
  marks: Mark[];
  voice: string;
  generatedJobs?: string[];
  fingerprint: string;
  size: number;
  format: string;
};
export type Settings = {
  theme: "light" | "dark";
  accent: string;
  background: string;
  font: string;
  fontSize: number;
  cardSize: number;
  coverSize: number;
  density: number;
  sidebar: boolean;
  playerCompact: boolean;
  speed: number;
  skip: number;
  volume: number;
  rewind: number;
  silenceSkip: boolean;
  silenceThreshold: number;
  silenceWindow: number;
  autoResume: boolean;
  sleep: number;
  voice: string;
  sort: string;
  goal: number;
  readerSize: number;
  readerFont: string;
  readerSpacing: number;
  readerTheme: string;
  companion: string;
};
export const defaults: Settings = {
  theme: "light",
  accent: "#526345",
  background: "#faf9f6",
  font: "system-ui",
  fontSize: 15,
  cardSize: 180,
  coverSize: 240,
  density: 1,
  sidebar: true,
  playerCompact: false,
  speed: 1,
  skip: 15,
  volume: 1,
  rewind: 5,
  silenceSkip: false,
  silenceThreshold: 0.001,
  silenceWindow: 0.25,
  autoResume: true,
  sleep: 0,
  voice: "",
  sort: "added",
  goal: 30,
  readerSize: 20,
  readerFont: "Georgia",
  readerSpacing: 1.8,
  readerTheme: "paper",
  companion: "http://127.0.0.1:8765",
};
export const uid = () => crypto.randomUUID();
export const time = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  s = Math.max(0, Math.floor(s));
  return (
    (s >= 3600
      ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}`
      : String(Math.floor(s / 60))) + `:${String(s % 60).padStart(2, "0")}`
  );
};
export const duration = (b: Book) =>
  b.chapters.reduce((n, c) => n + (c.duration || 0), 0);
export const progress = (b: Book) =>
  b.completed
    ? 100
    : duration(b)
      ? Math.min(
          100,
          (100 *
            (b.chapters
              .slice(0, b.chapter)
              .reduce((n, c) => n + (c.duration || 0), 0) +
              b.position)) /
            duration(b),
        )
      : 0;
export function filterBooks(
  books: Book[],
  query: string,
  filter: string,
  sort: string,
) {
  return books
    .filter(
      (b) =>
        `${b.title} ${b.author} ${b.category}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter === "all" ||
          (filter === "listening" && b.lastPlayed > 0 && !b.completed) ||
          (filter === "favorites" && b.favorite) ||
          (filter === "completed" && b.completed) ||
          (filter === "recent" && Date.now() - b.added < 30 * 86400000) ||
          (filter.startsWith("collection:") &&
            b.collection === filter.slice(11)) ||
          (filter.startsWith("author:") && b.author === filter.slice(7)) ||
          (filter.startsWith("genre:") && b.category === filter.slice(6))),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "author"
          ? a.author.localeCompare(b.author)
          : sort === "lastPlayed"
            ? b.lastPlayed - a.lastPlayed
            : sort === "duration"
              ? duration(b) - duration(a)
              : sort === "progress"
                ? progress(b) - progress(a)
                : b.added - a.added,
    );
}
export function changeChapters(book: Book, chapters: Chapter[]): Partial<Book> {
  if (!chapters.length) throw Error("A book must keep at least one chapter");
  const newIndex = (old: number) =>
    chapters.findIndex((c) => c.id === book.chapters[old]?.id);
  const chapter = newIndex(book.chapter),
    readerChapter = newIndex(book.readerChapter);
  return {
    chapters,
    chapter: Math.max(0, chapter),
    readerChapter: Math.max(0, readerChapter),
    position: chapter < 0 ? 0 : book.position,
    readerPosition: readerChapter < 0 ? 0 : book.readerPosition,
    marks: book.marks.flatMap((m) => {
      const index = newIndex(m.chapter);
      return index < 0 ? [] : [{ ...m, chapter: index }];
    }),
  };
}
