import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { readMP4Chapters } from "../src/mp4chapters";
it("extracts real M4B chapters without decoding audio", async () => {
  const bytes = await readFile("tests/fixtures/Garden.m4b");
  const chapters = await readMP4Chapters(new Blob([bytes]));
  expect(chapters).toEqual([
    { title: "Morning", start: 0 },
    { title: "Evening", start: 6 },
  ]);
});
it("rejects corrupt box lengths without looping", async () => {
  expect(await readMP4Chapters(new Blob([new Uint8Array(40)]))).toEqual([]);
});
