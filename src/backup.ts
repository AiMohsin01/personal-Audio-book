import { defaults, type Book, type Settings } from "./model";
export function validateBackup(data: unknown): asserts data is {
  version: 1;
  books: Book[];
  assets: { id: string; blob: Blob }[];
  settings?: Settings;
  collections?: string[];
  activity?: { date: string; seconds: number }[];
} {
  if (!data || typeof data !== "object")
    throw Error("Invalid backup: expected an object");
  const value = data as Record<string, any>;
  if (
    value.version !== 1 ||
    !Array.isArray(value.books) ||
    !Array.isArray(value.assets)
  )
    throw Error("Unsupported or incomplete backup");
  const ids = new Set<string>();
  for (const b of value.books) {
    if (
      !b ||
      typeof b.id !== "string" ||
      ids.has(b.id) ||
      typeof b.title !== "string" ||
      typeof b.author !== "string" ||
      !Array.isArray(b.chapters) ||
      !b.chapters.length ||
      !Array.isArray(b.marks)
    )
      throw Error("Invalid or duplicate book record");
    ids.add(b.id);
    for (const key of ["chapter", "readerChapter"])
      if (
        !Number.isInteger(b[key]) ||
        b[key] < 0 ||
        b[key] >= b.chapters.length
      )
        throw Error("Invalid chapter position");
    for (const key of [
      "position",
      "readerPosition",
      "size",
      "added",
      "lastPlayed",
    ])
      if (typeof b[key] !== "number" || !Number.isFinite(b[key]) || b[key] < 0)
        throw Error("Invalid book position or size");
    for (const c of b.chapters)
      if (
        !c ||
        typeof c.id !== "string" ||
        typeof c.title !== "string" ||
        (c.text !== undefined && typeof c.text !== "string") ||
        (c.assetId !== undefined && typeof c.assetId !== "string")
      )
        throw Error("Invalid chapter record");
    for (const m of b.marks)
      if (
        !m ||
        typeof m.text !== "string" ||
        typeof m.id !== "string" ||
        !Number.isInteger(m.chapter) ||
        m.chapter < 0 ||
        m.chapter >= b.chapters.length ||
        !Number.isFinite(m.position) ||
        m.position < 0
      )
        throw Error("Invalid bookmark record");
  }
  for (const a of value.assets)
    if (!a || typeof a.id !== "string" || !(a.blob instanceof Blob))
      throw Error("Invalid backup file");
  if (value.settings) {
    for (const [key, defaultValue] of Object.entries(defaults)) {
      if (
        key in value.settings &&
        typeof value.settings[key] !== typeof defaultValue
      )
        throw Error(`Invalid setting: ${key}`);
    }
    if (
      value.settings.speed !== undefined &&
      (value.settings.speed < 0.5 || value.settings.speed > 3)
    )
      throw Error("Invalid playback speed");
    if (
      value.settings.volume !== undefined &&
      (value.settings.volume < 0 || value.settings.volume > 1)
    )
      throw Error("Invalid volume");
  }
  if (
    value.collections &&
    (!Array.isArray(value.collections) ||
      value.collections.some((c: unknown) => typeof c !== "string"))
  )
    throw Error("Invalid collections");
  if (
    value.activity &&
    (!Array.isArray(value.activity) ||
      value.activity.some(
        (a: any) =>
          !a ||
          typeof a.date !== "string" ||
          !Number.isFinite(a.seconds) ||
          a.seconds < 0,
      ))
  )
    throw Error("Invalid listening history");
}
