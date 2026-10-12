import { it, expect } from "vitest";
import { validateBackup } from "../src/backup";
it("rejects malformed data before writing any IndexedDB records", () => {
  expect(() =>
    validateBackup({ version: 1, books: [{ id: "bad" }], assets: [] }),
  ).toThrow(/book record/);
  expect(() =>
    validateBackup({
      version: 1,
      books: [],
      assets: [{ id: "x", blob: "not-a-file" }],
    }),
  ).toThrow(/backup file/);
  expect(() =>
    validateBackup({
      version: 1,
      books: [],
      assets: [],
      settings: { volume: 5 },
    }),
  ).toThrow(/volume/);
  expect(() => validateBackup({ version: 999, books: [], assets: [] })).toThrow(
    /Unsupported/,
  );
});
it("accepts empty backups and restored binary files", () => {
  expect(() =>
    validateBackup({
      version: 1,
      books: [],
      assets: [{ id: "original", blob: new Blob(["audio"]) }],
      collections: ["Favorites"],
      activity: [{ date: "2026-10-11", seconds: 10 }],
    }),
  ).not.toThrow();
});
