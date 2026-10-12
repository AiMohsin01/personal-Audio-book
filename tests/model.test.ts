import { describe, it, expect } from "vitest";
import { filterBooks, progress, time, type Book } from "../src/model";
const book = (id: string, p: Partial<Book> = {}): Book => ({
  id,
  title: id,
  author: "Ada",
  description: "",
  category: "Essays",
  added: 1,
  lastPlayed: 0,
  favorite: false,
  completed: false,
  collection: "",
  chapters: [
    { id: "1", title: "Part 1", duration: 60 },
    { id: "2", title: "Part 2", duration: 120 },
  ],
  position: 30,
  chapter: 1,
  readerChapter: 0,
  readerPosition: 0,
  marks: [],
  voice: "",
  fingerprint: id,
  size: 1,
  format: "WAV",
  ...p,
});
describe("library and playback calculations", () => {
  it("uses all previous chapters for progress", () =>
    expect(progress(book("a"))).toBe(50));
  it("filters collections, completed books, and metadata", () => {
    const b = [
      book("z", { collection: "Bedtime", favorite: true }),
      book("a", { completed: true }),
    ];
    expect(
      filterBooks(b, "Ada", "collection:Bedtime", "title").map((b) => b.id),
    ).toEqual(["z"]);
    expect(filterBooks(b, "", "completed", "title").map((b) => b.id)).toEqual([
      "a",
    ]);
    expect(filterBooks(b, "missing", "all", "added")).toEqual([]);
  });
  it("sorts actual duration and title", () => {
    const b = [
      book("z"),
      book("a", { chapters: [{ id: "x", title: "x", duration: 300 }] }),
    ];
    expect(filterBooks(b, "", "all", "duration")[0].id).toBe("a");
    expect(filterBooks(b, "", "all", "title")[0].id).toBe("a");
  });
  it("formats hour-long files and unavailable durations", () => {
    expect(time(3661)).toBe("1:01:01");
    expect(time(NaN)).toBe("0:00");
  });
});
import { changeChapters } from "../src/model";
it("chapter reordering preserves notes and active positions by stable ID", () => {
  const b = book("a", {
    marks: [
      {
        id: "note",
        chapter: 1,
        position: 15,
        text: "A note",
        kind: "note",
        created: 1,
      },
    ],
    readerChapter: 0,
  });
  const p = changeChapters(b, [b.chapters[1], b.chapters[0]]);
  expect(p.chapter).toBe(0);
  expect(p.readerChapter).toBe(1);
  expect(p.position).toBe(30);
  expect(p.marks?.[0].chapter).toBe(0);
});
it("removing a chapter resets invalid positions and removes its notes", () => {
  const b = book("a", {
    marks: [
      {
        id: "note",
        chapter: 1,
        position: 15,
        text: "A note",
        kind: "note",
        created: 1,
      },
    ],
  });
  const p = changeChapters(b, [b.chapters[0]]);
  expect(p.chapter).toBe(0);
  expect(p.position).toBe(0);
  expect(p.marks).toEqual([]);
  expect(() => changeChapters(b, [])).toThrow();
});
